-- style_presets mutation RPC を dual_reference_source 対応へ拡張する。
-- 設計判断は docs/planning/style-preset-user-dual-and-prompt-implementation-plan.md Phase 1 参照。
-- 前回 (20260530080300) の 18 引数版を DROP して、末尾に p_dual_reference_source を追加した 19 引数版を CREATE する。

DROP FUNCTION IF EXISTS public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER
);
DROP FUNCTION IF EXISTS public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER
);

CREATE OR REPLACE FUNCTION public.create_style_preset(
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
  p_dual_reference_source TEXT DEFAULT 'admin'
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

  -- category 未指定なら 'coordinate' を default にする (既存挙動と同じ)
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
    prompt,
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
    dual_reference_source
  )
  VALUES (
    p_id,
    p_slug,
    p_title,
    p_styling_prompt,
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
    COALESCE(p_dual_reference_source, 'admin')
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

CREATE OR REPLACE FUNCTION public.update_style_preset(
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
  p_dual_reference_source TEXT DEFAULT 'admin'
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

  -- category 未指定なら現状値を維持する (NULL = 未指定の semantics)
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
    prompt = p_styling_prompt,
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
    dual_reference_source = COALESCE(p_dual_reference_source, 'admin')
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

REVOKE EXECUTE ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) TO service_role;

COMMENT ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) IS
  'style_presets の作成と表示順調整を原子的に行い、styling/background prompt + category + image_input_mode + reference image + dual_reference_source を保存する';
COMMENT ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) IS
  'style_presets の更新と表示順調整を原子的に行い、styling/background prompt + category + image_input_mode + reference image + dual_reference_source を保存する';
