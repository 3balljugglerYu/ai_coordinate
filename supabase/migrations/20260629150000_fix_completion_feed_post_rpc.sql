-- ===============================================
-- 完走フィード投稿 RPC の修正(MRAR コードレビュー反映)
-- ===============================================
-- MUST-FIX-001(security): 再投稿(再活性化)時に moderation_status='visible' を無条件
--   セットしていたため、admin が 'removed' にした投稿をキャンセル→再投稿で復活できた。
--   → 再活性化 UPDATE から moderation_status の上書きを削除(既存値を維持)。
--   これにより removed の投稿は再投稿しても removed のまま(管理者判断を尊重)。
--   既存の postImageServer(通常投稿の再投稿)も moderation_status を触らない方針と一致。
-- MUST-ADDRESS-003(defect): SELECT→INSERT に競合の穴(同時POSTで unique_violation→500)。
--   → INSERT を EXCEPTION WHEN unique_violation で保護し、競合時は既存行を取得して
--     冪等に再活性化する(冪等契約を満たす)。
-- ===============================================

CREATE OR REPLACE FUNCTION public.create_collection_completion_post(
  p_completion_id uuid,
  p_caption text,
  p_image_url text,
  p_storage_path text,
  p_storage_path_display text,
  p_storage_path_thumb text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_view_mode text;
  v_existing_id uuid;
  v_existing_posted boolean;
  v_post_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT cc.user_id, cc.mount_status, pc.completion_view_mode
    INTO v_owner, v_status, v_view_mode
    FROM public.collection_completions cc
    JOIN public.preset_categories pc ON pc.id = cc.category_id
    WHERE cc.id = p_completion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion not found';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'forbidden: not completion owner';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'completion not completed';
  END IF;

  SELECT id, is_posted INTO v_existing_id, v_existing_posted
    FROM public.generated_images
    WHERE completion_id = p_completion_id;

  IF FOUND THEN
    v_post_id := v_existing_id;
    IF NOT v_existing_posted THEN
      -- 再活性化: moderation_status は触らない(removed は removed のまま=MUST-FIX-001)
      UPDATE public.generated_images
        SET is_posted = true,
            posted_at = now(),
            caption = p_caption,
            completion_view_mode = v_view_mode
        WHERE id = v_post_id;
    END IF;
  ELSE
    BEGIN
      INSERT INTO public.generated_images (
        user_id, image_url, storage_path, storage_path_display, storage_path_thumb,
        prompt, caption, is_posted, posted_at, moderation_status,
        generation_type, generation_metadata, completion_id, completion_view_mode
      ) VALUES (
        v_uid, p_image_url, p_storage_path, p_storage_path_display, p_storage_path_thumb,
        '', p_caption, true, now(), 'visible',
        'one_tap_style', NULL, p_completion_id, v_view_mode
      )
      RETURNING id INTO v_post_id;
    EXCEPTION WHEN unique_violation THEN
      -- 競合(同時POST): 別リクエストが先に作成済み。既存行を取得して冪等に扱う。
      SELECT id, is_posted INTO v_existing_id, v_existing_posted
        FROM public.generated_images
        WHERE completion_id = p_completion_id;
      v_post_id := v_existing_id;
      IF NOT v_existing_posted THEN
        UPDATE public.generated_images
          SET is_posted = true,
              posted_at = now(),
              caption = p_caption,
              completion_view_mode = v_view_mode
          WHERE id = v_post_id;
      END IF;
    END;
  END IF;

  PERFORM public.grant_daily_post_bonus(v_uid, v_post_id);

  RETURN v_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_collection_completion_post(uuid, text, text, text, text, text) TO authenticated;

-- ===============================================
-- DOWN(手動): 直前定義(20260629140000)に戻す場合はそのファイルの関数本体を再適用。
-- ===============================================
