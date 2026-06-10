-- ===============================================
-- preset_categories に汎用コレクション設定を追加
-- ===============================================
-- どのプリセットカテゴリでも「コレクション(集めてコンプリート)」化できるよう、
-- カテゴリ単位の設定カラムを追加する。設計判断は
-- docs/planning/collection-feature-implementation-plan.md ADR-001 を参照。
--
-- - is_collection_series : このカテゴリをコレクションシリーズとして扱うか
-- - completion_threshold : コンプリートに必要なユニーク衣装数 N
-- - mount_template_path  : 台紙テンプレ(キャラを抜いた空PNG)の保存パス
-- - mount_layout         : 台紙レイアウト種別(スロット座標はコード側定数)
--
-- key は別トリガで不変。本カラムの UPDATE は許可される。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS is_collection_series BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_threshold INTEGER,
  ADD COLUMN IF NOT EXISTS mount_template_path TEXT,
  ADD COLUMN IF NOT EXISTS mount_layout TEXT;

-- N は正の整数のみ
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_completion_threshold_positive;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_completion_threshold_positive
  CHECK (completion_threshold IS NULL OR completion_threshold > 0);

-- レイアウトは対応済みの種別のみ(コード側 mount-layouts.ts と一致させる)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_mount_layout_supported;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_mount_layout_supported
  CHECK (mount_layout IS NULL OR mount_layout IN ('grid_3', 'grid_4', 'grid_6'));

-- コレクション有効時は N / テンプレ / レイアウトがすべて非NULLであること(R-02 をDB層で強制)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_collection_settings_complete;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_collection_settings_complete
  CHECK (
    is_collection_series = false
    OR (
      completion_threshold IS NOT NULL
      AND mount_template_path IS NOT NULL
      AND mount_layout IS NOT NULL
    )
  );

-- アクティブなコレクションシリーズの一覧取得用
CREATE INDEX IF NOT EXISTS idx_preset_categories_collection_series
  ON public.preset_categories (display_order, key)
  WHERE is_collection_series = true;

COMMENT ON COLUMN public.preset_categories.is_collection_series IS 'true なら集めてコンプリートするコレクションシリーズとして扱う';
COMMENT ON COLUMN public.preset_categories.completion_threshold IS 'コンプリートに必要なユニーク衣装数 N';
COMMENT ON COLUMN public.preset_categories.mount_template_path IS 'コンプリート台紙テンプレ(空PNG)の保存パス';
COMMENT ON COLUMN public.preset_categories.mount_layout IS '台紙レイアウト種別 grid_3 / grid_4 / grid_6';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_collection_settings_complete,
--   DROP CONSTRAINT IF EXISTS preset_categories_mount_layout_supported,
--   DROP CONSTRAINT IF EXISTS preset_categories_completion_threshold_positive;
-- DROP INDEX IF EXISTS public.idx_preset_categories_collection_series;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS mount_layout,
--   DROP COLUMN IF EXISTS mount_template_path,
--   DROP COLUMN IF EXISTS completion_threshold,
--   DROP COLUMN IF EXISTS is_collection_series;
-- ===============================================
