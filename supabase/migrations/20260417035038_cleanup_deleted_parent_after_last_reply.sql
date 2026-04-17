-- ===============================================
-- Cleanup deleted parent comments after the last reply is removed
-- 論理削除済み親コメントで最後の返信が消えた場合は親 tombstone も物理削除する
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
  v_parent_comment public.comments%ROWTYPE;
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
    SELECT *
    INTO v_parent_comment
    FROM public.comments
    WHERE id = v_comment.parent_comment_id
    FOR UPDATE;

    DELETE FROM public.comments
    WHERE id = v_comment.id;

    IF v_parent_comment.id IS NOT NULL AND v_parent_comment.deleted_at IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.comments
        WHERE public.comments.parent_comment_id = v_parent_comment.id
      )
      INTO v_has_replies;

      IF NOT v_has_replies THEN
        DELETE FROM public.comments
        WHERE id = v_parent_comment.id
          AND deleted_at IS NOT NULL;
      END IF;
    END IF;

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
