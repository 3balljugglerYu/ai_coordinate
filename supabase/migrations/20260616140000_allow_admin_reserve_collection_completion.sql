-- ===============================================
-- admin が admin_only コレクションをコンプリート(reserve)できるようにする
-- ===============================================
-- これまで reserve_collection_completion は内部で pc.visibility = 'public' に
-- 固定で絞っていたため、公開前(admin_only)のコレクションを admin が実際に
-- コンプリートして台紙生成まで通す動作確認ができなかった。
-- 台紙取得ルート(app/api/collections/mount/route.ts)は既に admin を許可している
-- ため、RPC 側も admin プレビューに合わせて admin_only を通せるようにする。
--
-- get_collection_progress_for_user(p_include_admin_only BOOLEAN) と対の関係で、
-- 新しい引数 p_allow_admin_only(デフォルト false)を追加する。
-- デフォルト false のため、明示的に true を渡さない既存呼び出しは挙動不変。
--
-- 安全性: threshold(N到達)チェックは従来どおり残す。admin_only シリーズは
-- 生成自体が運営で gating されているため、非 admin がカウントに到達することは
-- 通常なく、p_allow_admin_only=false の経路では従来どおり 'public' のみが対象。
-- ===============================================

DROP FUNCTION IF EXISTS public.reserve_collection_completion(TEXT);

CREATE OR REPLACE FUNCTION public.reserve_collection_completion(
  p_category_key TEXT,
  p_allow_admin_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  completion_id UUID,
  mount_status TEXT,
  newly_reserved BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_category_id UUID;
  v_threshold INTEGER;
  v_count INTEGER;
  v_id UUID;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pc.id, pc.completion_threshold
    INTO v_category_id, v_threshold
  FROM public.preset_categories pc
  WHERE pc.key = p_category_key
    AND pc.is_collection_series = true
    AND (pc.visibility = 'public' OR (p_allow_admin_only AND pc.visibility = 'admin_only'))
    AND pc.is_active = true;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'collection_series_not_found: %', p_category_key USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT ij.generation_metadata -> 'oneTapStyle' ->> 'id')
    INTO v_count
  FROM public.image_jobs ij
  WHERE ij.user_id = v_uid
    AND ij.style_preset_category_key = p_category_key
    AND ij.status = 'succeeded'
    AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL;

  IF v_count < v_threshold THEN
    RAISE EXCEPTION 'threshold_not_reached: % of %', v_count, v_threshold USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.collection_completions
    (user_id, category_id, category_key, threshold_at_completion, mount_status)
  VALUES
    (v_uid, v_category_id, p_category_key, v_threshold, 'generating')
  ON CONFLICT (user_id, category_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, 'generating'::TEXT, true;
    RETURN;
  END IF;

  SELECT cc.id, cc.mount_status
    INTO v_id, v_status
  FROM public.collection_completions cc
  WHERE cc.user_id = v_uid AND cc.category_id = v_category_id;

  IF v_status = 'failed' THEN
    UPDATE public.collection_completions cc
    SET mount_status = 'generating',
        mount_error = NULL,
        mount_image_path = NULL,
        completed_at = NULL
    WHERE cc.id = v_id
      AND cc.user_id = v_uid
      AND cc.mount_status = 'failed'
    RETURNING cc.id, cc.mount_status INTO v_id, v_status;

    RETURN QUERY SELECT v_id, v_status, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_id, v_status, false;
END;
$$;

-- 権限の再付与(新シグネチャに対して)。
-- anon/PUBLIC は実行不可。authenticated のみ実行可能。
REVOKE ALL ON FUNCTION public.reserve_collection_completion(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_collection_completion(TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.reserve_collection_completion(TEXT, BOOLEAN) IS
  'コレクション完了(台紙生成)を予約する。p_allow_admin_only=true のとき admin_only シリーズも対象にする(公開前の動作確認用、route 側で admin 判定して渡す)。N到達(threshold)チェックは常に残るため、admin_only は生成が運営で gating されている前提で非 admin が到達することはない。';
