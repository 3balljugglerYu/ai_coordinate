-- 生成画面に出す「ワンポイントアドバイス」。
--
-- 例: レンダリング品質を「バランス良く生成」にすると崩れにくいです！
--
-- 既にある user_guidance_ja とは別に持つ。あちらは「どんな画像を入れるとよいか」で、
-- スタイル画像カードの ⓘ ツールチップに出る（タップしないと読めない）。
-- こちらは**生成の操作についての助言**で、読まれないと意味がないため常に見える
-- 場所（生成モデルのカードの直前）に出す。同じ欄に混ぜると両方の意味が壊れる。
--
-- 解決順はユーザープロンプト入力欄と同じ「プリセット → カテゴリ → 出さない」。
-- カテゴリに既定を置き、必要なプリセットだけ上書きできる。

BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS generation_tip_ja text NULL,
  ADD COLUMN IF NOT EXISTS generation_tip_en text NULL;

COMMENT ON COLUMN public.preset_categories.generation_tip_ja IS
  'このカテゴリの生成画面に出すワンポイントアドバイス（日本語）。空なら出さない。プリセット側の同名列が優先。';
COMMENT ON COLUMN public.preset_categories.generation_tip_en IS
  'ワンポイントアドバイス（英語）。日本語以外のロケールで使う。';

ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS generation_tip_ja text NULL,
  ADD COLUMN IF NOT EXISTS generation_tip_en text NULL;

COMMENT ON COLUMN public.style_presets.generation_tip_ja IS
  'このスタイル固有のワンポイントアドバイス（日本語）。空ならカテゴリの設定を使う。';
COMMENT ON COLUMN public.style_presets.generation_tip_en IS
  'このスタイル固有のワンポイントアドバイス（英語）。空ならカテゴリの設定を使う。';

-- =============================================================================
-- スタイル作成・更新 RPC に 2 引数を足す
-- =============================================================================
-- ⚠️ 引数を増やすと別関数として登録され、名前付き引数の呼び出しが
-- 「どちらの関数か決められない」で落ちる。先に古い定義を落としてから作り直す。
-- 本体は現行定義のままで、追加した 2 列の受け渡しだけを足している。

DROP FUNCTION IF EXISTS public.create_style_preset(
  uuid, text, text, text, text, text, text, integer, integer, integer, text,
  uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer
);

DROP FUNCTION IF EXISTS public.update_style_preset(
  uuid, text, text, text, text, text, integer, integer, integer, text, uuid,
  uuid, text, text, text, integer, integer, text, uuid, text, text, integer
);

CREATE OR REPLACE FUNCTION public.create_style_preset(p_id uuid, p_slug text, p_title text, p_styling_prompt text, p_background_prompt text DEFAULT NULL::text, p_thumbnail_image_url text DEFAULT NULL::text, p_thumbnail_storage_path text DEFAULT NULL::text, p_thumbnail_width integer DEFAULT 0, p_thumbnail_height integer DEFAULT 0, p_sort_order integer DEFAULT 0, p_status text DEFAULT 'draft'::text, p_created_by uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_image_input_mode text DEFAULT 'single'::text, p_reference_image_url text DEFAULT NULL::text, p_reference_image_storage_path text DEFAULT NULL::text, p_reference_image_width integer DEFAULT NULL::integer, p_reference_image_height integer DEFAULT NULL::integer, p_dual_reference_source text DEFAULT 'admin'::text, p_provider_user_id uuid DEFAULT NULL::uuid, p_user_prompt_label text DEFAULT NULL::text, p_user_prompt_placeholder text DEFAULT NULL::text, p_user_prompt_max_length integer DEFAULT NULL::integer, p_generation_tip_ja text DEFAULT NULL::text, p_generation_tip_en text DEFAULT NULL::text)
 RETURNS style_presets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    provider_user_id,
    user_prompt_label,
    user_prompt_placeholder,
    user_prompt_max_length,
    generation_tip_ja,
    generation_tip_en
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
    p_provider_user_id,
    NULLIF(p_user_prompt_label, ''),
    NULLIF(p_user_prompt_placeholder, ''),
    p_user_prompt_max_length,
    NULLIF(p_generation_tip_ja, ''),
    NULLIF(p_generation_tip_en, '')
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
$function$;

CREATE OR REPLACE FUNCTION public.update_style_preset(p_id uuid, p_title text, p_styling_prompt text, p_background_prompt text DEFAULT NULL::text, p_thumbnail_image_url text DEFAULT NULL::text, p_thumbnail_storage_path text DEFAULT NULL::text, p_thumbnail_width integer DEFAULT 0, p_thumbnail_height integer DEFAULT 0, p_sort_order integer DEFAULT 0, p_status text DEFAULT 'draft'::text, p_updated_by uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_image_input_mode text DEFAULT 'single'::text, p_reference_image_url text DEFAULT NULL::text, p_reference_image_storage_path text DEFAULT NULL::text, p_reference_image_width integer DEFAULT NULL::integer, p_reference_image_height integer DEFAULT NULL::integer, p_dual_reference_source text DEFAULT 'admin'::text, p_provider_user_id uuid DEFAULT NULL::uuid, p_user_prompt_label text DEFAULT NULL::text, p_user_prompt_placeholder text DEFAULT NULL::text, p_user_prompt_max_length integer DEFAULT NULL::integer, p_generation_tip_ja text DEFAULT NULL::text, p_generation_tip_en text DEFAULT NULL::text)
 RETURNS style_presets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    provider_user_id = p_provider_user_id,
    user_prompt_label = NULLIF(p_user_prompt_label, ''),
    user_prompt_placeholder = NULLIF(p_user_prompt_placeholder, ''),
    user_prompt_max_length = p_user_prompt_max_length,
    generation_tip_ja = NULLIF(p_generation_tip_ja, ''),
    generation_tip_en = NULLIF(p_generation_tip_en, '')
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
$function$;

-- ⚠️ DROP すると EXECUTE 権限も一緒に消え、作り直した関数は PostgreSQL の既定で
-- PUBLIC に実行を許してしまう。この2つは SECURITY DEFINER なので、開いたままだと
-- admin 認証を通さずにスタイルを作成・更新できることになる。
-- 適用前と同じ「service_role のみ」に戻す。
REVOKE ALL ON FUNCTION public.create_style_preset(uuid, text, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_style_preset(uuid, text, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_style_preset(uuid, text, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_style_preset(uuid, text, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_style_preset(uuid, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_style_preset(uuid, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_style_preset(uuid, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_style_preset(uuid, text, text, text, text, text, integer, integer, integer, text, uuid, uuid, text, text, text, integer, integer, text, uuid, text, text, integer, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
