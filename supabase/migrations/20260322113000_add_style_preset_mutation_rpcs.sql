-- style_presets の create / update / delete / reorder を原子的に処理する RPC

CREATE OR REPLACE FUNCTION public.place_style_preset_at_order(
  p_preset_id UUID,
  p_desired_index INTEGER DEFAULT 0,
  p_updated_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.style_presets
    WHERE id = p_preset_id
  ) THEN
    RAISE EXCEPTION 'style preset not found';
  END IF;

  WITH remaining AS (
    SELECT
      sp.id,
      sp.created_at,
      ROW_NUMBER() OVER (
        ORDER BY sp.sort_order ASC, sp.created_at ASC, sp.id ASC
      ) - 1 AS seq
    FROM public.style_presets sp
    WHERE sp.id <> p_preset_id
  ),
  target AS (
    SELECT GREATEST(
      0,
      LEAST(
        COALESCE(p_desired_index, 0),
        (SELECT COUNT(*) FROM remaining)
      )
    ) AS idx
  ),
  candidate_order AS (
    SELECT
      sp.id,
      CASE
        WHEN sp.id = p_preset_id THEN (SELECT idx FROM target) + 0.5
        WHEN remaining.seq >= (SELECT idx FROM target) THEN remaining.seq + 1
        ELSE remaining.seq
      END AS position_key,
      sp.created_at
    FROM public.style_presets sp
    LEFT JOIN remaining ON remaining.id = sp.id
  ),
  reordered AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY position_key ASC, created_at ASC, id ASC
      ) - 1 AS new_sort_order
    FROM candidate_order
  )
  UPDATE public.style_presets sp
  SET
    sort_order = reordered.new_sort_order,
    updated_by = COALESCE(p_updated_by, sp.updated_by)
  FROM reordered
  WHERE sp.id = reordered.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_style_preset(
  p_id UUID,
  p_slug TEXT,
  p_title TEXT,
  p_prompt TEXT,
  p_thumbnail_image_url TEXT,
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
    p_prompt,
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
  p_prompt TEXT,
  p_thumbnail_image_url TEXT,
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
    prompt = p_prompt,
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

CREATE OR REPLACE FUNCTION public.delete_style_preset_and_reorder(
  p_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('style_presets_order', 0));

  DELETE FROM public.style_presets
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'style preset not found';
  END IF;

  WITH remaining AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY sort_order ASC, created_at ASC, id ASC
      ) - 1 AS new_sort_order
    FROM public.style_presets
  )
  UPDATE public.style_presets sp
  SET sort_order = remaining.new_sort_order
  FROM remaining
  WHERE sp.id = remaining.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_style_presets(
  p_order UUID[],
  p_updated_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_unique_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('style_presets_order', 0));

  SELECT COUNT(*) INTO v_total
  FROM public.style_presets;

  SELECT COUNT(DISTINCT id) INTO v_unique_count
  FROM unnest(COALESCE(p_order, ARRAY[]::UUID[])) AS ordered(id);

  IF COALESCE(array_length(p_order, 1), 0) <> v_total OR v_unique_count <> v_total THEN
    RAISE EXCEPTION 'order must include each preset exactly once';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.style_presets sp
    WHERE NOT sp.id = ANY(p_order)
  ) THEN
    RAISE EXCEPTION 'order must include each preset exactly once';
  END IF;

  UPDATE public.style_presets sp
  SET
    sort_order = ordered.ordinality - 1,
    updated_by = COALESCE(p_updated_by, sp.updated_by)
  FROM unnest(p_order) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE sp.id = ordered.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_style_preset_at_order(UUID, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_style_preset_and_reorder(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_style_presets(UUID[], UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_style_preset_at_order(UUID, INTEGER, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_style_preset_and_reorder(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reorder_style_presets(UUID[], UUID)
  TO service_role;

COMMENT ON FUNCTION public.place_style_preset_at_order(UUID, INTEGER, UUID) IS
  'style_presets の対象行を指定の sort_order に移し、全体を連番へ再採番する helper';
COMMENT ON FUNCTION public.create_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID) IS
  'style_presets の作成と表示順調整を原子的に行う';
COMMENT ON FUNCTION public.update_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID) IS
  'style_presets の更新と表示順調整を原子的に行う';
COMMENT ON FUNCTION public.delete_style_preset_and_reorder(UUID) IS
  'style_presets の削除と残り行の再採番を原子的に行う';
COMMENT ON FUNCTION public.reorder_style_presets(UUID[], UUID) IS
  'style_presets の表示順を指定 UUID 配列順に原子的に更新する';
