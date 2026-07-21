-- コメント「返信への返信」(引用リプライ) のデータ基盤。
--
-- 1階層フラットスレッド(parent_comment_id)は維持し、同一スレッド内の
-- どの返信に対する発言かを reply_to_comment_id で参照する(Discord型引用)。
-- 設計詳細: docs/planning/comment-reply-to-reply-implementation-plan.md
--
-- 引用状態の判別:
--   reply_to_comment_id=NULL, reply_to_deleted=false → 通常の返信
--   reply_to_comment_id=あり, reply_to_deleted=false → 引用リプライ(引用先存命)
--   reply_to_comment_id=NULL, reply_to_deleted=true  → 引用リプライ(引用先削除済み)

-- ===============================================
-- 1. カラム・インデックス
-- ===============================================

ALTER TABLE public.comments
  ADD COLUMN reply_to_comment_id UUID NULL
    REFERENCES public.comments(id) ON DELETE SET NULL,
  ADD COLUMN reply_to_deleted BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.comments.reply_to_comment_id IS
  '引用先の返信(同一スレッド内の返信のみ)。親コメント引用は不可。引用先の物理削除で NULL 化';
COMMENT ON COLUMN public.comments.reply_to_deleted IS
  '引用先が削除されたら true (mark_reply_to_deleted trigger)。通常返信との区別に使う';

-- 引用先削除時の参照元更新用。
CREATE INDEX idx_comments_reply_to_comment_id
  ON public.comments (reply_to_comment_id)
  WHERE reply_to_comment_id IS NOT NULL;

-- ===============================================
-- 2. validate_parent_comment 拡張
--    (20260416120000 の定義に引用検証を追加)
-- ===============================================

CREATE OR REPLACE FUNCTION public.validate_parent_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent public.comments%ROWTYPE;
  v_reply_to public.comments%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.image_id IS DISTINCT FROM OLD.image_id THEN
      RAISE EXCEPTION 'image_id is immutable for comments';
    END IF;

    IF NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id THEN
      RAISE EXCEPTION 'parent_comment_id is immutable for comments';
    END IF;

    -- 引用参照は「外す」方向のみ許可する。
    -- FK ON DELETE SET NULL(引用先の物理削除)による NULL 化を通しつつ、
    -- 付け替え(別コメントへの変更)はデータ改ざんとして拒否する。
    IF NEW.reply_to_comment_id IS DISTINCT FROM OLD.reply_to_comment_id
      AND NOT (OLD.reply_to_comment_id IS NOT NULL AND NEW.reply_to_comment_id IS NULL) THEN
      RAISE EXCEPTION 'reply_to_comment_id can only be cleared';
    END IF;

    -- 削除フラグは false→true の一方向のみ(mark_reply_to_deleted trigger 用)。
    IF NEW.reply_to_deleted IS DISTINCT FROM OLD.reply_to_deleted
      AND NOT (OLD.reply_to_deleted = FALSE AND NEW.reply_to_deleted = TRUE) THEN
      RAISE EXCEPTION 'reply_to_deleted can only transition to true';
    END IF;

    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      AND current_setting('app.comment_delete_rpc', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'deleted_at can only be changed via delete_comment_thread';
    END IF;

    RETURN NEW;
  END IF;

  -- INSERT: 削除フラグ付きの新規作成は不可(トリガー専用フラグ)。
  IF NEW.reply_to_deleted THEN
    RAISE EXCEPTION 'reply_to_deleted cannot be set on insert';
  END IF;

  IF NEW.parent_comment_id IS NULL THEN
    -- 親コメントは引用を持てない(引用は返信間のみ)。
    IF NEW.reply_to_comment_id IS NOT NULL THEN
      RAISE EXCEPTION 'REPLY_TO_INVALID_TARGET: top-level comments cannot quote';
    END IF;
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

  -- 引用リプライの検証。エラーメッセージの REPLY_TO_ プレフィックスは
  -- server-api 側で 400 エラーコードへマッピングする規約(docs/API.md)。
  IF NEW.reply_to_comment_id IS NOT NULL THEN
    IF NEW.reply_to_comment_id = NEW.id THEN
      RAISE EXCEPTION 'REPLY_TO_INVALID_TARGET: a comment cannot quote itself';
    END IF;

    -- 引用先も KEY SHARE でロックし、引用先削除との race を直列化する。
    SELECT *
    INTO v_reply_to
    FROM public.comments
    WHERE id = NEW.reply_to_comment_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPLY_TO_NOT_FOUND: reply target comment not found';
    END IF;

    -- 引用先は「同一スレッドの返信」のみ。親コメント自身
    -- (parent_comment_id IS NULL)もこの条件で拒否される(ADR-005)。
    IF v_reply_to.parent_comment_id IS DISTINCT FROM NEW.parent_comment_id THEN
      RAISE EXCEPTION 'REPLY_TO_INVALID_TARGET: reply target must be a reply in the same thread';
    END IF;

    IF v_reply_to.image_id <> NEW.image_id THEN
      RAISE EXCEPTION 'REPLY_TO_INVALID_TARGET: reply target must belong to the same image';
    END IF;

    IF v_reply_to.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'REPLY_TO_DELETED: cannot quote a deleted comment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ===============================================
-- 3. 引用先削除時のフラグ立て
-- ===============================================

-- 引用先(返信)が物理削除される直前に、参照元の reply_to_deleted を立てる。
-- この後 FK の ON DELETE SET NULL が reply_to_comment_id を NULL 化するため、
-- 「引用していたが削除された」状態(NULL + true)が残り、通常返信と区別できる。
-- validate_parent_comment の UPDATE 検証は false→true / 非NULL→NULL を
-- 許可しているため、この内部更新と FK 動作はどちらも通る。
CREATE OR REPLACE FUNCTION public.mark_reply_to_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.comments
  SET reply_to_deleted = TRUE
  WHERE reply_to_comment_id = OLD.id
    AND reply_to_deleted = FALSE;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_mark_reply_to_deleted ON public.comments;
CREATE TRIGGER trigger_mark_reply_to_deleted
BEFORE DELETE
ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.mark_reply_to_deleted();

-- ===============================================
-- 4. notify_on_comment 拡張
--    (返信ブランチに引用リプライの宛先分岐を追加。
--     引用リプライは引用先作成者のみへ通知し、親コメント作成者へは通知しない)
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

  -- 引用リプライ: 宛先は引用先の作成者のみ。
  -- 親コメント作成者・投稿所有者へは通知しない(重複・過剰通知の防止)。
  -- 自己通知は create_notification 内でスキップされる。
  IF NEW.reply_to_comment_id IS NOT NULL THEN
    SELECT reply_to.user_id, image.image_url
    INTO v_recipient_id, v_image_url
    FROM public.comments AS reply_to
    JOIN public.generated_images AS image
      ON image.id = reply_to.image_id
    WHERE reply_to.id = NEW.reply_to_comment_id;

    IF v_recipient_id IS NULL THEN
      RETURN NEW;
    END IF;

    PERFORM public.create_notification(
      v_recipient_id,
      NEW.user_id,
      'comment',
      'comment',
      NEW.parent_comment_id,
      COALESCE(v_actor_nickname, 'ユーザー') || 'があなたの返信に返信しました',
      v_comment_preview,
      jsonb_build_object(
        'reply_kind', 'reply_to_reply',
        'image_id', NEW.image_id,
        'image_url', v_image_url,
        'comment_id', NEW.id,
        'reply_to_comment_id', NEW.reply_to_comment_id,
        'parent_comment_id', NEW.parent_comment_id,
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
