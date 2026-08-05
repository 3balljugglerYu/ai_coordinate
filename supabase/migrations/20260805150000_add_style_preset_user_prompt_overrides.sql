-- One-Tap Style の各スタイル(style_presets)ごとに、ユーザープロンプト入力欄の
-- 「ラベル・プレースホルダ・最大文字数」を上書き設定できるようにする。
--
-- 解決順(3段フォールバック): プリセット設定 → カテゴリ設定 → i18n 既定(上限は 1500)。
-- NULL = 上位に継承。既存プリセットは全て NULL のため挙動は変わらない。
-- 表示 ON/OFF のマスタースイッチ(preset_categories.show_user_prompt_input)は
-- 従来どおりカテゴリ単位のまま(per-style で上書きするのは文言と上限のみ)。
--
-- 方針(20260626100000 の provider_user_id 追加と同型):
--   - create_style_preset / update_style_preset は引数追加(アリティ変更)のため
--     CREATE OR REPLACE 不可。DROP + CREATE で作り直し、権限を元どおり再付与する。
--   - 末尾に 3 引数(いずれも DEFAULT NULL)を追加(既存の名前付き呼び出しは非破壊)。
--   - update は直接代入(= リポジトリ層が「未指定なら現状値」を常に解決して送る前提)。
--   - 文字数上限(ラベル<=120 / placeholder<=200 / max_length 1..1500)の業務検証は
--     API 層で行う(カテゴリ側 preset_categories と同じ役割分担。DB CHECK は置かない)。
--
-- 適用順序(重要): 本マイグレーション(RPC 差し替え)を先に適用してからコードをデプロイすること。
--   アプリは create/update で新引数を常時送るため、未適用のままコードを出すと
--   PostgREST のオーバーロード解決に失敗し、全プリセットの作成・更新が PGRST202 で壊れる。
--   (逆順=マイグレーション先行は安全: 旧コードは新引数を送らず DEFAULT NULL で解決される)
--
-- 注: down migration (列削除・RPC 差し戻し) は明示しない。
-- 既に admin が設定した上書き値が消えるリスクがあるため、必要時に個別判断する。

BEGIN;

-- =============================================================================
-- 1. style_presets に上書き 3 列を追加
-- =============================================================================

ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS user_prompt_label text NULL,
  ADD COLUMN IF NOT EXISTS user_prompt_placeholder text NULL,
  ADD COLUMN IF NOT EXISTS user_prompt_max_length integer NULL;

COMMENT ON COLUMN public.style_presets.user_prompt_label IS
  '/style のユーザープロンプト textarea のラベル(スタイル別上書き)。NULL ならカテゴリ設定 → i18n 既定の順でフォールバック';
COMMENT ON COLUMN public.style_presets.user_prompt_placeholder IS
  '/style のユーザープロンプト textarea の placeholder(スタイル別上書き)。NULL ならカテゴリ設定 → i18n 既定の順でフォールバック';
COMMENT ON COLUMN public.style_presets.user_prompt_max_length IS
  '/style のユーザープロンプト textarea の最大文字数(スタイル別上書き)。NULL ならカテゴリ設定 → 既定 1500 の順でフォールバック';

-- =============================================================================
-- 2. create_style_preset / update_style_preset を新引数付きで作り直す
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
);
DROP FUNCTION IF EXISTS public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID
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
  p_provider_user_id UUID DEFAULT NULL,
  p_user_prompt_label TEXT DEFAULT NULL,
  p_user_prompt_placeholder TEXT DEFAULT NULL,
  p_user_prompt_max_length INTEGER DEFAULT NULL
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
    provider_user_id,
    user_prompt_label,
    user_prompt_placeholder,
    user_prompt_max_length
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
    p_user_prompt_max_length
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
  p_provider_user_id UUID DEFAULT NULL,
  p_user_prompt_label TEXT DEFAULT NULL,
  p_user_prompt_placeholder TEXT DEFAULT NULL,
  p_user_prompt_max_length INTEGER DEFAULT NULL
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
    provider_user_id = p_provider_user_id,
    user_prompt_label = NULLIF(p_user_prompt_label, ''),
    user_prompt_placeholder = NULLIF(p_user_prompt_placeholder, ''),
    user_prompt_max_length = p_user_prompt_max_length
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
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.create_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER
) IS 'スタイル新規作成(p_user_prompt_label/_placeholder/_max_length でユーザープロンプト入力欄をスタイル別に上書き可。NULL はカテゴリ設定へ継承)';
COMMENT ON FUNCTION public.update_style_preset(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID,
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER
) IS 'スタイル更新(p_user_prompt_label/_placeholder/_max_length でユーザープロンプト入力欄をスタイル別に上書き/解除可。NULL はカテゴリ設定へ継承)';

-- =============================================================================
-- 3. カタログ検証(列・RPC アリティ・権限)
-- =============================================================================

DO $$
DECLARE
  v_columns integer;
  v_create_new integer;
  v_update_new integer;
  v_old_arity integer;
BEGIN
  SELECT count(*) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'style_presets'
    AND column_name IN ('user_prompt_label', 'user_prompt_placeholder', 'user_prompt_max_length');
  IF v_columns <> 3 THEN
    RAISE EXCEPTION 'style_presets の上書き列が % 本しかない(3 本必要)', v_columns;
  END IF;

  SELECT count(*) INTO v_create_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_style_preset' AND p.pronargs = 23;
  SELECT count(*) INTO v_update_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_style_preset' AND p.pronargs = 22;
  IF v_create_new <> 1 OR v_update_new <> 1 THEN
    RAISE EXCEPTION 'RPC の新シグネチャが見つからない(create23=% update22=%)', v_create_new, v_update_new;
  END IF;

  -- 旧アリティが残っているとオーバーロード曖昧化で PostgREST が解決に失敗する
  SELECT count(*) INTO v_old_arity
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND ((p.proname = 'create_style_preset' AND p.pronargs <> 23)
      OR (p.proname = 'update_style_preset' AND p.pronargs <> 22));
  IF v_old_arity <> 0 THEN
    RAISE EXCEPTION '旧シグネチャの RPC が % 本残っている(オーバーロード曖昧化)', v_old_arity;
  END IF;

  IF has_function_privilege('authenticated',
    'public.update_style_preset(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, INTEGER)',
    'EXECUTE')
  THEN
    RAISE EXCEPTION 'update_style_preset が authenticated から実行可能になっている';
  END IF;

  RAISE NOTICE 'カタログ検証 OK(上書き3列・RPC 2本の新シグネチャ・旧シグネチャ0本・authenticated 実行不可)';
END;
$$;

-- RPC シグネチャ変更(DROP+CREATE)を PostgREST のスキーマキャッシュへ明示反映する。
-- event trigger(pgrst_ddl_watch/pgrst_drop_watch)による自動 reload は即時とは限らず、
-- 過去に PGRST202 を踏んだ実績があるため明示する(20260730200100 と同じ方針)。
-- NOTIFY はトランザクショナルで COMMIT 時に配送される。
NOTIFY pgrst, 'reload schema';

COMMIT;
