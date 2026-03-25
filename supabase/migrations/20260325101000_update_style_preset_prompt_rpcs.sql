-- style_presets mutation RPC を styling/background prompt 対応へ拡張する

DROP FUNCTION IF EXISTS public.create_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
);

DROP FUNCTION IF EXISTS public.update_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
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
  p_created_by UUID DEFAULT NULL
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created public.style_presets;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('style_presets_order', 0));

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
    updated_by
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
    p_created_by
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
  p_updated_by UUID DEFAULT NULL
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.style_presets;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('style_presets_order', 0));

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
    updated_by = p_updated_by
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
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
) TO service_role;

COMMENT ON FUNCTION public.create_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
) IS
  'style_presets の作成と表示順調整を原子的に行い、styling/background prompt を保存する';
COMMENT ON FUNCTION public.update_style_preset(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID
) IS
  'style_presets の更新と表示順調整を原子的に行い、styling/background prompt を保存する';
