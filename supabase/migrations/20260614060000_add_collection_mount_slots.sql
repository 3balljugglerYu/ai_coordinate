-- ===============================================
-- preset_categories に「台紙スロット(枠)のカスタム定義」と台紙実寸を追加
-- ===============================================
-- 運営が台紙アップロード後に枠(スロット)を調整できるようにする土台(Phase 1)。
-- 設計判断は docs/planning/collection-mount-slot-editor-implementation-plan.md
-- ADR-001 / ADR-002 を参照。
--
-- - mount_slots          : 台紙スロットの正規化矩形配列 [{x,y,w,h}] (0..1)。
--                          値があればコード側 MOUNT_LAYOUTS(grid_3/4/6) より優先して
--                          合成に使う。NULL なら従来どおりプリセットにフォールバック。
-- - mount_template_width  : 台紙テンプレ画像の実寸(px)。表示アスペクト自動導出に使う。
-- - mount_template_height : 同上。
--
-- すべて nullable。既存カテゴリ(神コレ等)は mount_slots=NULL のまま動作不変。
-- key は別トリガで不変。本カラムの UPDATE は許可される。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS mount_slots JSONB,
  ADD COLUMN IF NOT EXISTS mount_template_width INTEGER,
  ADD COLUMN IF NOT EXISTS mount_template_height INTEGER;

-- mount_slots は JSON 配列のみ(要素の中身検証は API 層で行う)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_mount_slots_is_array;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_mount_slots_is_array
  CHECK (mount_slots IS NULL OR jsonb_typeof(mount_slots) = 'array');

-- 台紙実寸は正の整数のみ
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_mount_template_dimensions_positive;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_mount_template_dimensions_positive
  CHECK (
    (mount_template_width IS NULL OR mount_template_width > 0)
    AND (mount_template_height IS NULL OR mount_template_height > 0)
  );

-- コレクション有効時の必須項目を緩和:
-- 従来は mount_layout 必須だったが、任意N(カスタム枠)対応のため
-- 「mount_layout か mount_slots のどちらかがあればよい」に変更する。
-- (旧: 20260608090000 で追加した preset_categories_collection_settings_complete)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_collection_settings_complete;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_collection_settings_complete
  CHECK (
    is_collection_series = false
    OR (
      completion_threshold IS NOT NULL
      AND mount_template_path IS NOT NULL
      AND (mount_layout IS NOT NULL OR mount_slots IS NOT NULL)
    )
  );

COMMENT ON COLUMN public.preset_categories.mount_slots IS '台紙スロットの正規化矩形配列 [{x,y,w,h}] (0..1)。NULL なら mount_layout のプリセットにフォールバック';
COMMENT ON COLUMN public.preset_categories.mount_template_width IS '台紙テンプレ画像の実寸(px)。表示アスペクト自動導出に使用';
COMMENT ON COLUMN public.preset_categories.mount_template_height IS '台紙テンプレ画像の実寸(px)。表示アスペクト自動導出に使用';

-- ===============================================
-- DOWN:
-- -- 旧 completeness 制約(mount_layout 必須)に戻す
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_collection_settings_complete;
-- ALTER TABLE public.preset_categories
--   ADD CONSTRAINT preset_categories_collection_settings_complete
--   CHECK (
--     is_collection_series = false
--     OR (
--       completion_threshold IS NOT NULL
--       AND mount_template_path IS NOT NULL
--       AND mount_layout IS NOT NULL
--     )
--   );
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_mount_template_dimensions_positive,
--   DROP CONSTRAINT IF EXISTS preset_categories_mount_slots_is_array;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS mount_template_height,
--   DROP COLUMN IF EXISTS mount_template_width,
--   DROP COLUMN IF EXISTS mount_slots;
-- ===============================================
