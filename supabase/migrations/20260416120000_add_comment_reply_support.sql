-- ===============================================
-- Comment reply support
-- コメントの親子構造、並び替えソートキー、削除RPC、通知/Realtime分岐を追加
-- ===============================================

-- ===============================================
-- 1. comments schema updates
-- ===============================================

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE public.comments
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

ALTER TABLE public.comments
  ALTER COLUMN last_activity_at SET DEFAULT now();

ALTER TABLE public.comments
  ALTER COLUMN last_activity_at SET NOT NULL;

-- 親コメント一覧: image_id + last_activity_at DESC + id DESC
CREATE INDEX IF NOT EXISTS idx_comments_image_top_level_last_activity
  ON public.comments (image_id, last_activity_at DESC, id DESC)
  WHERE parent_comment_id IS NULL;

-- 返信一覧 / FK cascade / reply_count: parent_comment_id + created_at DESC + id DESC
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_created_at
  ON public.comments (parent_comment_id, created_at DESC, id DESC);

-- ===============================================
-- 2. parent validation and last_activity maintenance
-- ===============================================

CREATE OR REPLACE FUNCTION public.validate_parent_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent public.comments%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.image_id IS DISTINCT FROM OLD.image_id THEN
      RAISE EXCEPTION 'image_id is immutable for comments';
    END IF;

    IF NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id THEN
      RAISE EXCEPTION 'parent_comment_id is immutable for comments';
    END IF;

    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      AND current_setting('app.comment_delete_rpc', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'deleted_at can only be changed via delete_comment_thread';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_comment_id = NEW.id THEN
    RAISE EXCEPTION 'A comment cannot reply to itself';
  END IF;

  -- 親行を KEY SHARE でロックし、削除RPC(FOR UPDATE) と競合させる。
  -- これにより、親削除と返信作成の race を SQL 側で直列化する。
  SELECT *
  INTO v_parent
  FROM public.comments
  WHERE id = NEW.parent_comment_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent comment not found';
  END IF;

  IF v_parent.parent_comment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Replies to replies are not allowed';
  END IF;

  IF v_parent.image_id <> NEW.image_id THEN
    RAISE EXCEPTION 'Parent comment must belong to the same image';
  END IF;

  IF v_parent.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot reply to a deleted comment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_parent_comment ON public.comments;
CREATE TRIGGER trigger_validate_parent_comment
BEFORE INSERT OR UPDATE
ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.validate_parent_comment();

CREATE OR REPLACE FUNCTION public.prevent_direct_parent_delete_with_replies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.parent_comment_id IS NOT NULL THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.comments
    WHERE parent_comment_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Top-level comments with replies must be deleted via delete_comment_thread';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_direct_parent_delete_with_replies ON public.comments;
CREATE TRIGGER trigger_prevent_direct_parent_delete_with_replies
BEFORE DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_direct_parent_delete_with_replies();

CREATE OR REPLACE FUNCTION public.update_parent_last_activity_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.comments
  SET last_activity_at = GREATEST(COALESCE(last_activity_at, created_at), NEW.created_at)
  WHERE id = NEW.parent_comment_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_parent_last_activity_at ON public.comments;
CREATE TRIGGER trigger_update_parent_last_activity_at
AFTER INSERT ON public.comments
FOR EACH ROW
WHEN (NEW.parent_comment_id IS NOT NULL)
EXECUTE FUNCTION public.update_parent_last_activity_at();

CREATE OR REPLACE FUNCTION public.update_parent_last_activity_at_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.parent_comment_id IS NULL THEN
    RETURN OLD;
  END IF;

  UPDATE public.comments AS parent
  SET last_activity_at = GREATEST(
    parent.created_at,
    COALESCE(
      (
        SELECT MAX(reply.created_at)
        FROM public.comments AS reply
        WHERE reply.parent_comment_id = OLD.parent_comment_id
      ),
      parent.created_at
    )
  )
  WHERE parent.id = OLD.parent_comment_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_parent_last_activity_at_on_delete ON public.comments;
CREATE TRIGGER trigger_update_parent_last_activity_at_on_delete
AFTER DELETE ON public.comments
FOR EACH ROW
WHEN (OLD.parent_comment_id IS NOT NULL)
EXECUTE FUNCTION public.update_parent_last_activity_at_on_delete();

-- ===============================================
-- 3. reply lifecycle broadcast
-- ===============================================

CREATE OR REPLACE FUNCTION public.broadcast_reply_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_id UUID;
  v_parent_comment_id UUID;
  v_comment_id UUID;
  v_user_id UUID;
  v_payload JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_image_id := OLD.image_id;
    v_parent_comment_id := OLD.parent_comment_id;
    v_comment_id := OLD.id;
    v_user_id := OLD.user_id;
  ELSE
    v_image_id := NEW.image_id;
    v_parent_comment_id := NEW.parent_comment_id;
    v_comment_id := NEW.id;
    v_user_id := NEW.user_id;
  END IF;

  IF v_parent_comment_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'event_type', TG_OP,
    'image_id', v_image_id,
    'parent_comment_id', v_parent_comment_id,
    'comment_id', v_comment_id,
    'user_id', v_user_id
  );

  PERFORM realtime.send(
    v_payload,
    'reply_lifecycle',
    format('comments:%s', v_image_id),
    false
  );

  PERFORM realtime.send(
    v_payload,
    'reply_lifecycle',
    format('comments:replies:%s', v_parent_comment_id),
    false
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to broadcast reply lifecycle event: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_broadcast_reply_insert ON public.comments;
CREATE TRIGGER trigger_broadcast_reply_insert
AFTER INSERT ON public.comments
FOR EACH ROW
WHEN (NEW.parent_comment_id IS NOT NULL)
EXECUTE FUNCTION public.broadcast_reply_lifecycle_event();

DROP TRIGGER IF EXISTS trigger_broadcast_reply_delete ON public.comments;
CREATE TRIGGER trigger_broadcast_reply_delete
AFTER DELETE ON public.comments
FOR EACH ROW
WHEN (OLD.parent_comment_id IS NOT NULL)
EXECUTE FUNCTION public.broadcast_reply_lifecycle_event();

-- ===============================================
-- 4. delete_comment_thread RPC
-- ===============================================

CREATE OR REPLACE FUNCTION public.delete_comment_thread(p_comment_id UUID)
RETURNS TABLE(
  comment_id UUID,
  image_id UUID,
  parent_comment_id UUID,
  deleted TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment public.comments%ROWTYPE;
  v_has_replies BOOLEAN;
BEGIN
  PERFORM set_config('app.comment_delete_rpc', '1', true);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_comment
  FROM public.comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  IF v_comment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_comment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Comment is already deleted';
  END IF;

  IF v_comment.parent_comment_id IS NOT NULL THEN
    DELETE FROM public.comments
    WHERE id = v_comment.id;

    RETURN QUERY
    SELECT v_comment.id, v_comment.image_id, v_comment.parent_comment_id, 'physical'::TEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.comments
    WHERE public.comments.parent_comment_id = v_comment.id
  )
  INTO v_has_replies;

  IF v_has_replies THEN
    UPDATE public.comments
    SET deleted_at = now()
    WHERE id = v_comment.id;

    DELETE FROM public.notifications
    WHERE public.notifications.comment_id = v_comment.id
      AND public.notifications.type = 'comment'
      AND public.notifications.entity_type = 'post';

    RETURN QUERY
    SELECT v_comment.id, v_comment.image_id, v_comment.parent_comment_id, 'logical'::TEXT;
    RETURN;
  END IF;

  DELETE FROM public.comments
  WHERE id = v_comment.id;

  RETURN QUERY
  SELECT v_comment.id, v_comment.image_id, v_comment.parent_comment_id, 'physical'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_comment_thread(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_comment_thread(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_comment_thread(UUID) TO service_role;

-- ===============================================
-- 5. notification branching for top-level comments vs replies
-- ===============================================

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
  v_actor_nickname TEXT;
  v_image_url TEXT;
  v_comment_preview TEXT;
BEGIN
  SELECT nickname INTO v_actor_nickname
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  v_comment_preview := LEFT(NEW.content, 50);
  IF LENGTH(NEW.content) > 50 THEN
    v_comment_preview := v_comment_preview || '...';
  END IF;

  IF NEW.parent_comment_id IS NULL THEN
    SELECT user_id, image_url
    INTO v_recipient_id, v_image_url
    FROM public.generated_images
    WHERE id = NEW.image_id;

    IF v_recipient_id IS NULL THEN
      RETURN NEW;
    END IF;

    PERFORM public.create_notification(
      v_recipient_id,
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
  END IF;

  SELECT parent.user_id, image.image_url
  INTO v_recipient_id, v_image_url
  FROM public.comments AS parent
  JOIN public.generated_images AS image
    ON image.id = parent.image_id
  WHERE parent.id = NEW.parent_comment_id;

  IF v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    v_recipient_id,
    NEW.user_id,
    'comment',
    'comment',
    NEW.parent_comment_id,
    COALESCE(v_actor_nickname, 'ユーザー') || 'があなたのコメントに返信しました',
    v_comment_preview,
    jsonb_build_object(
      'image_id', NEW.image_id,
      'image_url', v_image_url,
      'comment_id', NEW.id,
      'parent_comment_id', NEW.parent_comment_id,
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
