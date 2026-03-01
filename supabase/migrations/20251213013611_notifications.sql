-- ===============================================
-- Notifications System Migration
-- 通知機能のテーブル、インデックス、RLSポリシー
-- ===============================================

-- ===============================================
-- 1. notificationsテーブル
-- ===============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('post', 'comment', 'user')),
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::JSONB,
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  push_status TEXT DEFAULT 'pending' CHECK (push_status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created 
  ON public.notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread 
  ON public.notifications(recipient_id, is_read) 
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id 
  ON public.notifications(recipient_id);

-- RLS有効化
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: SELECT（自分が受け取る通知のみ閲覧可能）
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  USING ((select auth.uid()) = recipient_id);

-- RLSポリシー: UPDATE（既読更新のみ）
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING ((select auth.uid()) = recipient_id)
  WITH CHECK ((select auth.uid()) = recipient_id);

-- RLSポリシー: DELETE（自分が受け取る通知のみ削除可能）
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications
  FOR DELETE
  USING ((select auth.uid()) = recipient_id);

-- RLSポリシー: INSERT（関数経由のみ、直接INSERT不可）
DROP POLICY IF EXISTS "Prevent direct insert to notifications" ON public.notifications;
CREATE POLICY "Prevent direct insert to notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (false);

-- RLSポリシー: プッシュ通知更新用（service_role JWT のみ許可）
-- ※ service_role は通常 RLS をバイパスしますが、明示的に制御したい場合の保険として定義
DROP POLICY IF EXISTS "Service role can update push status" ON public.notifications;
CREATE POLICY "Service role can update push status"
  ON public.notifications
  FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- ===============================================
-- 2. push_subscriptionsテーブル（将来用）
-- ===============================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  token TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, device_id)
);

-- RLS有効化
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ===============================================
-- 3. notification_preferencesテーブル
-- ===============================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  like_enabled BOOLEAN DEFAULT true NOT NULL,
  comment_enabled BOOLEAN DEFAULT true NOT NULL,
  follow_enabled BOOLEAN DEFAULT true NOT NULL,
  push_enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS有効化
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
DROP POLICY IF EXISTS "Users can manage their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage their own notification preferences"
  ON public.notification_preferences
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trigger_update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- ===============================================
-- 4. followsテーブル（新規作成）
-- ===============================================

CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  followee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(follower_id, followee_id),
  CHECK(follower_id != followee_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_follows_follower_id 
  ON public.follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_followee_id 
  ON public.follows(followee_id);

-- RLS有効化
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: SELECT（自分が関与している行だけ閲覧可能）
DROP POLICY IF EXISTS "Users can view follows they are involved in" ON public.follows;
CREATE POLICY "Users can view follows they are involved in"
  ON public.follows
  FOR SELECT
  USING ((select auth.uid()) = follower_id OR (select auth.uid()) = followee_id);

-- RLSポリシー: INSERT（自分がフォローする場合のみ）
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others"
  ON public.follows
  FOR INSERT
  WITH CHECK ((select auth.uid()) = follower_id);

-- RLSポリシー: DELETE（自分がフォロー解除する場合のみ）
DROP POLICY IF EXISTS "Users can unfollow others" ON public.follows;
CREATE POLICY "Users can unfollow others"
  ON public.follows
  FOR DELETE
  USING ((select auth.uid()) = follower_id);

-- ===============================================
-- 5. 通知生成関数とトリガ（フェーズ2）
-- ===============================================

-- ===============================================
-- 5.1 create_notification関数
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
  -- v_preferences が NULL の場合は、COALESCE によりデフォルト値（true）が使用される
  IF p_type = 'like' AND COALESCE(v_preferences.like_enabled, true) = false THEN
    RETURN NULL;
  END IF;
  IF p_type = 'comment' AND COALESCE(v_preferences.comment_enabled, true) = false THEN
    RETURN NULL;
  END IF;
  IF p_type = 'follow' AND COALESCE(v_preferences.follow_enabled, true) = false THEN
    RETURN NULL;
  END IF;

  -- 通知レコードを作成（重複防止インデックス使用時はON CONFLICT DO NOTHING）
  INSERT INTO notifications (
    recipient_id, actor_id, type, entity_type, entity_id,
    title, body, data
  ) VALUES (
    p_recipient_id, p_actor_id, p_type, p_entity_type, p_entity_id,
    p_title, p_body, p_data
  )
  -- 重複防止インデックス使用時のみ有効化
  -- ON CONFLICT (recipient_id, actor_id, type, entity_type, entity_id) 
  -- WHERE created_at > now() - interval '1 hour'
  -- DO NOTHING
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録
    RAISE WARNING 'Failed to create notification: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- ===============================================
-- 5.2 いいね通知トリガ
-- ===============================================

CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER AS $$
DECLARE
  v_image_owner_id UUID;
  v_actor_nickname TEXT;
  v_image_url TEXT;
BEGIN
  -- 投稿の所有者を取得（NULLチェック）
  SELECT user_id, image_url INTO v_image_owner_id, v_image_url
  FROM generated_images
  WHERE id = NEW.image_id;

  -- 所有者が存在しない場合は通知を作成しない
  IF v_image_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- アクターのニックネームを取得（失敗しても続行）
  SELECT nickname INTO v_actor_nickname
  FROM profiles
  WHERE user_id = NEW.user_id;

  -- 通知を作成（エラー時もトランザクション継続）
  PERFORM create_notification(
    v_image_owner_id,
    NEW.user_id,
    'like',
    'post',
    NEW.image_id,
    COALESCE(v_actor_nickname, 'ユーザー') || 'があなたの投稿にいいねしました',
    '',
    jsonb_build_object('image_id', NEW.image_id, 'image_url', v_image_url)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録し、トランザクションを継続（いいね処理は成功させる）
    RAISE WARNING 'Failed to create notification for like: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_notify_on_like ON likes;
CREATE TRIGGER trigger_notify_on_like
AFTER INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION notify_on_like();

-- ===============================================
-- 5.3 コメント通知トリガ
-- ===============================================

CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_image_owner_id UUID;
  v_actor_nickname TEXT;
  v_image_url TEXT;
  v_comment_preview TEXT;
BEGIN
  -- 投稿の所有者を取得（NULLチェック）
  SELECT user_id, image_url INTO v_image_owner_id, v_image_url
  FROM generated_images
  WHERE id = NEW.image_id;

  -- 所有者が存在しない場合は通知を作成しない
  IF v_image_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- アクターのニックネームを取得（失敗しても続行）
  SELECT nickname INTO v_actor_nickname
  FROM profiles
  WHERE user_id = NEW.user_id;

  -- コメントのプレビュー（最大50文字）
  v_comment_preview := LEFT(NEW.content, 50);
  IF LENGTH(NEW.content) > 50 THEN
    v_comment_preview := v_comment_preview || '...';
  END IF;

  -- 通知を作成（エラー時もトランザクション継続）
  PERFORM create_notification(
    v_image_owner_id,
    NEW.user_id,
    'comment',
    'post',
    NEW.image_id,
    COALESCE(v_actor_nickname, 'ユーザー') || 'があなたの投稿にコメントしました',
    v_comment_preview,
    jsonb_build_object(
      'image_id', NEW.image_id,
      'image_url', v_image_url,
      'comment_id', NEW.id,
      'comment_content', NEW.content
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録し、トランザクションを継続（コメント処理は成功させる）
    RAISE WARNING 'Failed to create notification for comment: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_notify_on_comment ON comments;
CREATE TRIGGER trigger_notify_on_comment
AFTER INSERT ON comments
FOR EACH ROW
WHEN (NEW.deleted_at IS NULL)
EXECUTE FUNCTION notify_on_comment();

-- ===============================================
-- 5.4 フォロー通知トリガ
-- ===============================================

CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_nickname TEXT;
BEGIN
  -- アクターのニックネームを取得（失敗しても続行）
  SELECT nickname INTO v_actor_nickname
  FROM profiles
  WHERE user_id = NEW.follower_id;

  -- 通知を作成（エラー時もトランザクション継続）
  PERFORM create_notification(
    NEW.followee_id,
    NEW.follower_id,
    'follow',
    'user',
    NEW.followee_id,
    COALESCE(v_actor_nickname, 'ユーザー') || 'があなたをフォローしました',
    '',
    jsonb_build_object('follower_id', NEW.follower_id)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録し、トランザクションを継続（フォロー処理は成功させる）
    RAISE WARNING 'Failed to create notification for follow: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_notify_on_follow ON follows;
CREATE TRIGGER trigger_notify_on_follow
AFTER INSERT ON follows
FOR EACH ROW
EXECUTE FUNCTION notify_on_follow();

