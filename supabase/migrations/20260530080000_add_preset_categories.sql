-- preset_categories テーブル: style_presets のカテゴリを動的に管理する。
-- 設計判断は docs/planning/style-preset-raw-mode-implementation-plan.md ADR-001..002 参照。

CREATE TABLE IF NOT EXISTS public.preset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_name_ja TEXT NOT NULL,
  display_name_en TEXT NOT NULL,
  badge_color TEXT NOT NULL DEFAULT '#1f2937',
  badge_text_color TEXT NOT NULL DEFAULT '#ffffff',
  skip_base_prefix BOOLEAN NOT NULL DEFAULT false,
  default_image_input_mode TEXT NOT NULL DEFAULT 'single'
    CHECK (default_image_input_mode IN ('single', 'dual')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preset_categories_active_order
  ON public.preset_categories (display_order, key)
  WHERE is_active = true;

-- updated_at 自動更新
DROP TRIGGER IF EXISTS update_preset_categories_updated_at ON public.preset_categories;
CREATE TRIGGER update_preset_categories_updated_at
  BEFORE UPDATE ON public.preset_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- key は不変原則 (ADR-006): 過去ジョブのスナップショット集計を守るため UPDATE 拒否
CREATE OR REPLACE FUNCTION public.prevent_preset_category_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'preset_categories.key is immutable (was %, attempted %)', OLD.key, NEW.key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_preset_categories_key_change ON public.preset_categories;
CREATE TRIGGER prevent_preset_categories_key_change
  BEFORE UPDATE ON public.preset_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_preset_category_key_change();

-- RLS: 公開 SELECT (全行)。過去 preset の表示には inactive category 情報も必要なので
-- is_active で絞らない。admin の新規割り当てフィルタは API 層で行う (計画 REQ-7)。
ALTER TABLE public.preset_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preset_categories_public_read" ON public.preset_categories;
CREATE POLICY "preset_categories_public_read"
  ON public.preset_categories
  FOR SELECT
  USING (true);

-- seed: コーディネート (既存 preset の backfill 対象) + ちびキャラ (raw モードの初期ケース)
INSERT INTO public.preset_categories
  (key, display_name_ja, display_name_en, badge_color, badge_text_color, skip_base_prefix, default_image_input_mode, display_order)
VALUES
  ('coordinate', 'コーディネート', 'Coordinate', '#1f2937', '#ffffff', false, 'single', 0),
  ('chibi',      'ちびキャラ',      'Chibi',     '#ec4899', '#ffffff', true,  'single', 10)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.preset_categories IS 'style_presets を分類するカテゴリ。skip_base_prefix で共通プロンプト付与を制御する';
COMMENT ON COLUMN public.preset_categories.key IS '不変 slug。image_jobs.style_preset_category_key のスナップショットとして集計に使う';
COMMENT ON COLUMN public.preset_categories.skip_base_prefix IS 'true なら style.base_prefix を完全に付与しない (raw モード)';
COMMENT ON COLUMN public.preset_categories.default_image_input_mode IS 'preset 新規作成時の image_input_mode の初期値';
COMMENT ON COLUMN public.preset_categories.is_active IS '新規 preset 作成時の選択肢から外すかどうか。既存 preset の表示は status で制御';
