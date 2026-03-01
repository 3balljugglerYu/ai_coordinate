-- ===============================================
-- Notifications: Comment Per Notification
-- コメントごとに通知を作成するように変更
-- ===============================================
-- 実装内容:
-- 1. notificationsテーブルにcomment_idカラムを追加（コメント通知の場合のみ使用）
-- 2. ユニーク制約を変更（コメント通知の場合はcomment_idを含める）
-- 3. create_notification関数を修正（コメント通知の場合は常にINSERT）
-- 4. コメント削除トリガーを修正（comment_idで削除）
-- ===============================================

-- ===============================================
-- 1. notificationsテーブルにcomment_idカラムを追加
-- ===============================================

DO $$
BEGIN
  -- comment_idカラムが既に存在する場合はスキップ
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'comment_id'
  ) THEN
    ALTER TABLE notifications
    ADD COLUMN comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- インデックス追加（コメント削除時のパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id 
  ON notifications(comment_id) 
  WHERE comment_id IS NOT NULL;

-- ===============================================
-- 2. ユニーク制約の変更
-- ===============================================

-- 既存のユニーク制約を削除
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND constraint_name = 'notifications_unique_action'
  ) THEN
    ALTER TABLE notifications
    DROP CONSTRAINT notifications_unique_action;
  END IF;
END $$;

-- 新しいユニーク制約を追加
-- コメント通知の場合はcomment_idを含める
-- いいね/フォロー通知の場合は既存のキーのみ
-- PostgreSQLでは部分的なユニーク制約はCREATE UNIQUE INDEXを使用

-- コメント通知用のユニークインデックス（comment_idを含む）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_unique_comment_idx'
  ) THEN
    CREATE UNIQUE INDEX notifications_unique_comment_idx
    ON notifications (recipient_id, actor_id, type, entity_type, entity_id, comment_id)
    WHERE type = 'comment' AND comment_id IS NOT NULL;
  END IF;
END $$;

-- いいね/フォロー通知用のユニークインデックス（既存のキーのみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_unique_like_follow_idx'
  ) THEN
    CREATE UNIQUE INDEX notifications_unique_like_follow_idx
    ON notifications (recipient_id, actor_id, type, entity_type, entity_id)
    WHERE type IN ('like', 'follow');
  END IF;
END $$;

-- ===============================================
-- 3. create_notification関数の修正
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
  v_comment_id UUID;
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

  -- コメント通知の場合はcomment_idを取得
  IF p_type = 'comment' THEN
    v_comment_id := (p_data->>'comment_id')::UUID;
  END IF;

  -- コメント通知の場合は常にINSERT（UPSERTしない）
  -- いいね/フォロー通知の場合はUPSERT
  IF p_type = 'comment' AND v_comment_id IS NOT NULL THEN
    -- コメント通知: 常にINSERT（コメントごとに通知を作成）
    INSERT INTO notifications (
      recipient_id, actor_id, type, entity_type, entity_id,
      title, body, data, comment_id
    ) VALUES (
      p_recipient_id, p_actor_id, p_type, p_entity_type, p_entity_id,
      p_title, p_body, p_data, v_comment_id
    )
    RETURNING id INTO v_notification_id;
  ELSE
    -- いいね/フォロー通知: UPSERT（再アクション時は更新）
    -- 部分的なユニークインデックスを使用するため、ON CONFLICT ON CONSTRAINTは使えない
    -- 代わりに、条件付きでUPSERTを実行
    BEGIN
      INSERT INTO notifications (
        recipient_id, actor_id, type, entity_type, entity_id,
        title, body, data
      ) VALUES (
        p_recipient_id, p_actor_id, p_type, p_entity_type, p_entity_id,
        p_title, p_body, p_data
      )
      RETURNING id INTO v_notification_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- 既存の通知を更新
        UPDATE notifications
        SET
          created_at = now(),
          title = p_title,
          body = p_body,
          data = p_data
        WHERE recipient_id = p_recipient_id
          AND actor_id = p_actor_id
          AND type = p_type
          AND entity_type = p_entity_type
          AND entity_id = p_entity_id
        RETURNING id INTO v_notification_id;
    END;
  END IF;

  RETURN v_notification_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create notification: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- ===============================================
-- 4. コメント削除トリガーの修正
-- ===============================================

CREATE OR REPLACE FUNCTION delete_notification_on_comment_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- comment_idで通知を削除（より正確に削除できる）
  DELETE FROM notifications
  WHERE comment_id = OLD.id;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete notification for comment deletion: %', SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- トリガーは既に存在するので、関数のみ更新される

-- ===============================================
-- 5. 既存のコメント通知にcomment_idを設定
-- ===============================================

DO $$
BEGIN
  -- 既存のコメント通知のcomment_idを設定
  UPDATE notifications n
  SET comment_id = (n.data->>'comment_id')::UUID
  WHERE n.type = 'comment'
    AND n.comment_id IS NULL
    AND n.data->>'comment_id' IS NOT NULL;
END $$;
