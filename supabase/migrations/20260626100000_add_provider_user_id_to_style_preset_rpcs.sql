-- admin が各プリセットの「クリエイター(提供者クレジット = provider_user_id)」を
-- 選択・変更できるようにするため、create_style_preset / update_style_preset RPC に
-- p_provider_user_id 引数を追加する。
--
-- 方針:
--   - 引数追加はアリティ変更のため CREATE OR REPLACE 不可(別オーバーロードになり曖昧化)。
--     よって DROP + CREATE で作り直し、権限を元どおり再付与する。
--   - 末尾に p_provider_user_id UUID DEFAULT NULL を追加(既存の名前付き呼び出しは非破壊)。
--   - update は直接代入(= フォームが現在値/選択値を常に送る前提。NULL でクレジット解除可)。
--   - 「選択できるのは allowlist のクリエイターのみ」という業務制約は API 層で検証する
--     (provider_user_id は profiles.id 参照で、列の FK のみが DB 側の保証)。
--
-- 適用順序(重要): 本マイグレーション(RPC 差し替え)を先に適用してからコードをデプロイすること。
--   アプリは create/update で p_provider_user_id を常時送るため、未適用のままコードを出すと
--   PostgREST のオーバーロード解決に失敗し、全プリセットの作成・更新が PGRST202 で壊れる。

BEGIN;

DROP FUNCTION IF EXISTS public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
);
DROP FUNCTION IF EXISTS public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
);

CREATE FUNCTION public.create_style_preset(
  p_id UUID,
  p_slug TEXT,
  p_title TEXT,
  p_styling_prompt TEXT,
  p_background_prompt TEXT DEFAULT NULL,
  p_thumbnail_image_url TEXT DEFAULT NULL,
  p_thumbnail_storage_path TEXT DEFAULT NULL,
  p_thumbnail_width INTEGER DEFAULT 0,
  p_thumbnail_height INTEGER DEFAULT 0,
  p_sort_order INTEGER DEFAULT 0,
  p_status TEXT DEFAULT 'draft',
  p_created_by UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_image_input_mode TEXT DEFAULT 'single',
  p_reference_image_url TEXT DEFAULT NULL,
  p_reference_image_storage_path TEXT DEFAULT NULL,
  p_reference_image_width INTEGER DEFAULT NULL,
  p_reference_image_height INTEGER DEFAULT NULL,
  p_dual_reference_source TEXT DEFAULT 'admin',
  p_provider_user_id UUID DEFAULT NULL
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created public.style_presets;
  v_category_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('style_presets_order', 0));

  IF p_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM public.preset_categories WHERE key = 'coordinate';
    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'default preset_categories row "coordinate" is missing';
    END IF;
  ELSE
    v_category_id := p_category_id;
  END IF;

  INSERT INTO public.style_presets (
    id,
    slug,
    title,
    styling_prompt,
    background_prompt,
    thumbnail_image_url,
    thumbnail_storage_path,
    thumbnail_width,
    thumbnail_height,
    sort_order,
    status,
    created_by,
    updated_by,
    category_id,
    image_input_mode,
    reference_image_url,
    reference_image_storage_path,
    reference_image_width,
    reference_image_height,
    dual_reference_source,
    provider_user_id
  )
  VALUES (
    p_id,
    p_slug,
    p_title,
    p_styling_prompt,
    NULLIF(p_background_prompt, ''),
    p_thumbnail_image_url,
    p_thumbnail_storage_path,
    p_thumbnail_width,
    p_thumbnail_height,
    GREATEST(0, COALESCE(p_sort_order, 0)),
    p_status,
    p_created_by,
    p_created_by,
    v_category_id,
    COALESCE(p_image_input_mode, 'single'),
    p_reference_image_url,
    p_reference_image_storage_path,
    p_reference_image_width,
    p_reference_image_height,
    COALESCE(p_dual_reference_source, 'admin'),
    p_provider_user_id
  )
  RETURNING * INTO v_created;

  PERFORM public.place_style_preset_at_order(
    v_created.id,
    GREATEST(0, COALESCE(p_sort_order, 0)),
    p_created_by
  );

  SELECT *
  INTO v_created
  FROM public.style_presets
  WHERE id = v_created.id;

  RETURN v_created;
END;
$$;

CREATE FUNCTION public.update_style_preset(
  p_id UUID,
  p_title TEXT,
  p_styling_prompt TEXT,
  p_background_prompt TEXT DEFAULT NULL,
  p_thumbnail_image_url TEXT DEFAULT NULL,
  p_thumbnail_storage_path TEXT DEFAULT NULL,
  p_thumbnail_width INTEGER DEFAULT 0,
  p_thumbnail_height INTEGER DEFAULT 0,
  p_sort_order INTEGER DEFAULT 0,
  p_status TEXT DEFAULT 'draft',
  p_updated_by UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_image_input_mode TEXT DEFAULT 'single',
  p_reference_image_url TEXT DEFAULT NULL,
  p_reference_image_storage_path TEXT DEFAULT NULL,
  p_reference_image_width INTEGER DEFAULT NULL,
  p_reference_image_height INTEGER DEFAULT NULL,
  p_dual_reference_source TEXT DEFAULT 'admin',
  p_provider_user_id UUID DEFAULT NULL
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.style_presets;
  v_category_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('style_presets_order', 0));

  IF p_category_id IS NULL THEN
    SELECT category_id INTO v_category_id FROM public.style_presets WHERE id = p_id;
    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'style preset not found';
    END IF;
  ELSE
    v_category_id := p_category_id;
  END IF;

  UPDATE public.style_presets
  SET
    title = p_title,
    styling_prompt = p_styling_prompt,
    background_prompt = NULLIF(p_background_prompt, ''),
    thumbnail_image_url = p_thumbnail_image_url,
    thumbnail_storage_path = p_thumbnail_storage_path,
    thumbnail_width = p_thumbnail_width,
    thumbnail_height = p_thumbnail_height,
    sort_order = GREATEST(0, COALESCE(p_sort_order, 0)),
    status = p_status,
    updated_by = p_updated_by,
    category_id = v_category_id,
    image_input_mode = COALESCE(p_image_input_mode, 'single'),
    reference_image_url = p_reference_image_url,
    reference_image_storage_path = p_reference_image_storage_path,
    reference_image_width = p_reference_image_width,
    reference_image_height = p_reference_image_height,
    dual_reference_source = COALESCE(p_dual_reference_source, 'admin'),
    provider_user_id = p_provider_user_id
  WHERE id = p_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'style preset not found';
  END IF;

  PERFORM public.place_style_preset_at_order(
    p_id,
    GREATEST(0, COALESCE(p_sort_order, 0)),
    p_updated_by
  );

  SELECT *
  INTO v_updated
  FROM public.style_presets
  WHERE id = p_id;

  RETURN v_updated;
END;
$$;

-- 権限を元どおり再付与(SECURITY DEFINER の admin 用 RPC。anon/authenticated からは実行不可)。
REVOKE EXECUTE ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
) IS 'スタイル新規作成(p_provider_user_id でクリエイター=提供者クレジットを設定可)';
COMMENT ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
) IS 'スタイル更新(p_provider_user_id でクリエイター=提供者クレジットを設定/解除可)';

COMMIT;
