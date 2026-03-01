-- ===============================================
-- Fix: SECURITY DEFINER function config
-- - Remove invalid `SET role = postgres` which causes:
--   "cannot set parameter \"role\" within security-definer function"
-- - Keep `SET search_path = public` for security
-- ===============================================

-- 1) notification_preferences updated_at trigger function: set search_path
CREATE OR REPLACE FUNCTION public.update_notification_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) create_notification: remove `SET role`, keep search_path, keep SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_notification(
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

  -- デフォルト設定（レコードがない場合）
  IF v_preferences IS NULL THEN
    v_preferences := ROW(true, true, true, true)::notification_preferences;
  END IF;

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

  INSERT INTO notifications (
    recipient_id, actor_id, type, entity_type, entity_id,
    title, body, data
  ) VALUES (
    p_recipient_id, p_actor_id, p_type, p_entity_type, p_entity_id,
    p_title, p_body, p_data
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create notification: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- 3) Trigger functions: remove `SET role`, keep search_path, keep SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_owner_id UUID;
  v_actor_nickname TEXT;
  v_image_url TEXT;
BEGIN
  SELECT user_id, image_url INTO v_image_owner_id, v_image_url
  FROM generated_images
  WHERE id = NEW.image_id;

  IF v_image_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nickname INTO v_actor_nickname
  FROM profiles
  WHERE user_id = NEW.user_id;

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
    RAISE WARNING 'Failed to create notification for like: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_owner_id UUID;
  v_actor_nickname TEXT;
  v_image_url TEXT;
  v_comment_preview TEXT;
BEGIN
  SELECT user_id, image_url INTO v_image_owner_id, v_image_url
  FROM generated_images
  WHERE id = NEW.image_id;

  IF v_image_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nickname INTO v_actor_nickname
  FROM profiles
  WHERE user_id = NEW.user_id;

  v_comment_preview := LEFT(NEW.content, 50);
  IF LENGTH(NEW.content) > 50 THEN
    v_comment_preview := v_comment_preview || '...';
  END IF;

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
    RAISE WARNING 'Failed to create notification for comment: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_nickname TEXT;
BEGIN
  SELECT nickname INTO v_actor_nickname
  FROM profiles
  WHERE user_id = NEW.follower_id;

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
    RAISE WARNING 'Failed to create notification for follow: %', SQLERRM;
    RETURN NEW;
END;
$$;


