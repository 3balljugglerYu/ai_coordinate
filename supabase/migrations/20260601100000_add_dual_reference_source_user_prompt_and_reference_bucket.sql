-- style-presets ユーザーカスタマイズ機能 (PR #292 後継):
--   1. style_presets.dual_reference_source TEXT NOT NULL DEFAULT 'admin'
--      → dual モードでの image_1 の出所 (admin が登録した画像 / ユーザーがその都度アップロード)
--   2. preset_categories.show_user_prompt_input BOOLEAN NOT NULL DEFAULT false
--      → /style にユーザープロンプト入力欄を出すかどうか
--   3. image_jobs.style_reference_image_bucket TEXT (nullable, CHECK enum)
--      → one_tap_style の image_1 取得元 bucket を明示。NULL は旧 job 互換で style_presets 扱い
--
-- 設計判断は docs/planning/style-preset-user-dual-and-prompt-implementation-plan.md
-- ADR-001, ADR-002, ADR-005 参照。

-- ============================================================================
-- 1. style_presets.dual_reference_source
-- ============================================================================
ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS dual_reference_source TEXT NOT NULL DEFAULT 'admin'
    CHECK (dual_reference_source IN ('admin', 'user_upload'));

COMMENT ON COLUMN public.style_presets.dual_reference_source IS
  'dual モードでの参考画像 (image_1) の出所。admin=preset 登録時の固定画像 / user_upload=ユーザーが /style で毎回アップロード';

-- ============================================================================
-- 2. preset_categories.show_user_prompt_input
-- ============================================================================
ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS show_user_prompt_input BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.preset_categories.show_user_prompt_input IS
  'true で /style にユーザー入力欄を表示。生成時は preset.stylingPrompt + ユーザー入力 を結合して送る';

-- ============================================================================
-- 3. image_jobs.style_reference_image_bucket (nullable, 旧 job 互換)
-- ============================================================================
ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS style_reference_image_bucket TEXT
    CHECK (
      style_reference_image_bucket IS NULL
      OR style_reference_image_bucket IN ('style_presets', 'generated-images')
    );

COMMENT ON COLUMN public.image_jobs.style_reference_image_bucket IS
  'one_tap_style の image_1 取得元 bucket。style_presets=admin preset 参考画像 / generated-images=user_upload temp 画像。NULL は旧 job 互換で style_presets 扱い';

-- ============================================================================
-- 4. CHECK 制約を緩和: dual_user_upload では reference 必須でなくなり、
--    single + user_upload (= dead 組み合わせ) は DB レベルで拒否する
-- ============================================================================
ALTER TABLE public.style_presets
  DROP CONSTRAINT IF EXISTS style_presets_dual_requires_reference;

ALTER TABLE public.style_presets
  ADD CONSTRAINT style_presets_dual_admin_requires_reference
  CHECK (
    (image_input_mode = 'single' AND dual_reference_source = 'admin')
    OR (image_input_mode = 'dual' AND dual_reference_source = 'user_upload')
    OR (
      image_input_mode = 'dual'
      AND dual_reference_source = 'admin'
      AND reference_image_storage_path IS NOT NULL
      AND reference_image_url IS NOT NULL
    )
  );
