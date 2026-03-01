-- ===============================================
-- Notifications Physical Delete Migration
-- 通知の物理削除機能の実装
-- ===============================================
-- 実装内容:
-- 1. 重複データのクリーンアップ（最新1件を残す）
-- 2. ユニーク制約の追加
-- 3. create_notification関数のUPSERT化
-- 4. 削除トリガーの追加（likes, follows, comments）
--    - likes: 物理削除時に通知を削除
--    - follows: 物理削除時に通知を削除
--    - comments: 物理削除時に通知を削除
-- 5. 孤立通知のクリーンアップ
-- ===============================================

-- ===============================================
-- 1. 重複データの確認とクリーンアップ
-- ===============================================

DO $$
DECLARE
  v_duplicate_groups INTEGER;
  v_notifications_to_delete INTEGER;
BEGIN
  -- 重複グループ数の確認
  SELECT COUNT(*) INTO v_duplicate_groups
  FROM (
    SELECT recipient_id, actor_id, type, entity_type, entity_id
    FROM notifications
    GROUP BY recipient_id, actor_id, type, entity_type, entity_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  -- 削除対象件数の確認
  SELECT COUNT(*) INTO v_notifications_to_delete
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY recipient_id, actor_id, type, entity_type, entity_id
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
  ) ranked
  WHERE rn > 1;
  
  RAISE NOTICE '重複通知グループ数: %', v_duplicate_groups;
  RAISE NOTICE '削除対象通知数: %', v_notifications_to_delete;
  
  -- 重複データのクリーンアップ（最新1件を残す）
  DELETE FROM notifications
  WHERE id IN (
    SELECT id
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY recipient_id, actor_id, type, entity_type, entity_id
          ORDER BY created_at DESC
        ) as rn
      FROM notifications
    ) ranked
    WHERE rn > 1
  );
END $$;

-- ===============================================
-- 2. ユニーク制約の追加
-- ===============================================

DO $$
BEGIN
  -- 制約が既に存在する場合はスキップ
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND constraint_name = 'notifications_unique_action'
  ) THEN
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_unique_action
    UNIQUE (recipient_id, actor_id, type, entity_type, entity_id);
  END IF;
END $$;

-- ===============================================
-- 3. create_notification関数のUPSERT化
-- ===============================================

CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_id UUID,
  p_actor_id UUID,
  p_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_preferences RECORD;
BEGIN
  -- 自分への通知は作成しない
  IF p_recipient_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  -- 通知設定を確認
  SELECT * INTO v_preferences
  FROM notification_preferences
  WHERE user_id = p_recipient_id;

  -- 通知タイプ別の設定チェック
  IF p_type = 'like' AND COALESCE(v_preferences.like_enabled, true) = false THEN
    RETURN NULL;
  END IF;
  IF p_type = 'comment' AND COALESCE(v_preferences.comment_enabled, true) = false THEN
    RETURN NULL;
  END IF;
  IF p_type = 'follow' AND COALESCE(v_preferences.follow_enabled, true) = false THEN
    RETURN NULL;
  END IF;

  -- UPSERT: 既存の通知があれば更新、なければ作成
  INSERT INTO notifications (
    recipient_id, actor_id, type, entity_type, entity_id,
    title, body, data
  ) VALUES (
    p_recipient_id, p_actor_id, p_type, p_entity_type, p_entity_id,
    p_title, p_body, p_data
  )
  ON CONFLICT (recipient_id, actor_id, type, entity_type, entity_id)
  DO UPDATE SET
    created_at = now(),
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    data = EXCLUDED.data
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create notification: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- ===============================================
-- 4. 削除トリガーの追加
-- ===============================================

-- ===============================================
-- 4.1 likesテーブルのDELETEトリガー
-- ===============================================

CREATE OR REPLACE FUNCTION delete_notification_on_like_removal()
RETURNS TRIGGER AS $$
DECLARE
  v_image_owner_id UUID;
BEGIN
  -- 投稿の所有者を取得
  SELECT user_id INTO v_image_owner_id
  FROM generated_images
  WHERE id = OLD.image_id;

  -- 所有者が存在する場合のみ通知を削除
  IF v_image_owner_id IS NOT NULL THEN
    DELETE FROM notifications
    WHERE recipient_id = v_image_owner_id
      AND actor_id = OLD.user_id
      AND type = 'like'
      AND entity_type = 'post'
      AND entity_id = OLD.image_id;
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete notification for like removal: %', SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_delete_notification_on_like_removal ON likes;
CREATE TRIGGER trigger_delete_notification_on_like_removal
AFTER DELETE ON likes
FOR EACH ROW
EXECUTE FUNCTION delete_notification_on_like_removal();

-- ===============================================
-- 4.2 followsテーブルのDELETEトリガー
-- ===============================================

CREATE OR REPLACE FUNCTION delete_notification_on_follow_removal()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM notifications
  WHERE recipient_id = OLD.followee_id
    AND actor_id = OLD.follower_id
    AND type = 'follow'
    AND entity_type = 'user'
    AND entity_id = OLD.followee_id;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete notification for follow removal: %', SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_delete_notification_on_follow_removal ON follows;
CREATE TRIGGER trigger_delete_notification_on_follow_removal
AFTER DELETE ON follows
FOR EACH ROW
EXECUTE FUNCTION delete_notification_on_follow_removal();

-- ===============================================
-- 4.3 commentsテーブルのDELETEトリガー
-- ===============================================

CREATE OR REPLACE FUNCTION delete_notification_on_comment_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_image_owner_id UUID;
BEGIN
  -- 投稿の所有者を取得
  SELECT user_id INTO v_image_owner_id
  FROM generated_images
  WHERE id = OLD.image_id;

  -- 所有者が存在する場合のみ通知を削除
  IF v_image_owner_id IS NOT NULL THEN
    DELETE FROM notifications
    WHERE recipient_id = v_image_owner_id
      AND actor_id = OLD.user_id
      AND type = 'comment'
      AND entity_type = 'post'
      AND entity_id = OLD.image_id;
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete notification for comment deletion: %', SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_delete_notification_on_comment_deletion ON comments;
CREATE TRIGGER trigger_delete_notification_on_comment_deletion
AFTER DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION delete_notification_on_comment_deletion();

-- ===============================================
-- 5. 孤立通知の確認とクリーンアップ
-- ===============================================

DO $$
DECLARE
  v_orphaned_count INTEGER;
BEGIN
  -- 孤立通知数の確認
  SELECT COUNT(*) INTO v_orphaned_count
  FROM notifications n
  WHERE (
    (n.type = 'like' AND NOT EXISTS (
      SELECT 1 FROM likes l 
      WHERE l.user_id = n.actor_id AND l.image_id = n.entity_id
    ))
    OR (n.type = 'follow' AND NOT EXISTS (
      SELECT 1 FROM follows f 
      WHERE f.follower_id = n.actor_id AND f.followee_id = n.entity_id
    ))
    OR (n.type = 'comment' AND NOT EXISTS (
      SELECT 1 FROM comments c 
      WHERE c.user_id = n.actor_id 
        AND c.image_id = n.entity_id
    ))
  );
  
  RAISE NOTICE '孤立通知数: %', v_orphaned_count;
  
  -- 孤立通知の削除
  DELETE FROM notifications n
  WHERE (
    (n.type = 'like' AND NOT EXISTS (
      SELECT 1 FROM likes l 
      WHERE l.user_id = n.actor_id AND l.image_id = n.entity_id
    ))
    OR (n.type = 'follow' AND NOT EXISTS (
      SELECT 1 FROM follows f 
      WHERE f.follower_id = n.actor_id AND f.followee_id = n.entity_id
    ))
    OR (n.type = 'comment' AND NOT EXISTS (
      SELECT 1 FROM comments c 
      WHERE c.user_id = n.actor_id 
        AND c.image_id = n.entity_id
    ))
  );
END $$;
