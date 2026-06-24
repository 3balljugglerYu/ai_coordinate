-- クリエイター提供プロンプト 申請システム(Phase 1): style_presets を申請パイプライン対応にする。
-- 計画書: docs/planning/creator-prompt-submission-plan.md
--
-- 方針(ADR-001/002/003/005):
--   - 公開成果物は style_preset。提供 prompt は styling_prompt に保存(公開 read で除外済=秘匿/moat)。
--   - 申請保持は style_presets に status='pending' を追加(単一エンティティ)。
--   - 承認で status='published' + provider_user_id=submitted_by_user_id(クレジット)。
--   - クリエイター提供用の新規 public カテゴリを追加(初期 admin_only → 確認後に public 化)。
--
-- 適用は運用側で別途実施(本ファイルはスキーマ定義のみ)。

-- 1) status の許容値に pending / rejected を追加(既存 draft/published を維持)。
--    元の inline CHECK 名は style_presets_status_check(自動命名)。
ALTER TABLE public.style_presets
  DROP CONSTRAINT IF EXISTS style_presets_status_check;

ALTER TABLE public.style_presets
  ADD CONSTRAINT style_presets_status_check
  CHECK (status IN ('draft', 'pending', 'published', 'rejected'));

-- 2) 申請メタ列(全て nullable=既存行に影響なし)。
ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS target_providers TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS recommended_provider TEXT NULL,
  ADD COLUMN IF NOT EXISTS submission_consents JSONB NULL,
  ADD COLUMN IF NOT EXISTS preview_openai_image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS preview_gemini_image_url TEXT NULL;

-- submitted_by_user_id は profiles(id) 参照(承認時に provider_user_id へ流用)。プロフィール削除時はクレジットを外す。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'style_presets_submitted_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.style_presets
      ADD CONSTRAINT style_presets_submitted_by_user_id_fkey
      FOREIGN KEY (submitted_by_user_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- provider 値域(openai / gemini)。preview_*_image_url のキーと一致させる。
ALTER TABLE public.style_presets
  DROP CONSTRAINT IF EXISTS style_presets_recommended_provider_check;
ALTER TABLE public.style_presets
  ADD CONSTRAINT style_presets_recommended_provider_check
  CHECK (recommended_provider IS NULL OR recommended_provider IN ('openai', 'gemini'));

ALTER TABLE public.style_presets
  DROP CONSTRAINT IF EXISTS style_presets_target_providers_check;
ALTER TABLE public.style_presets
  ADD CONSTRAINT style_presets_target_providers_check
  CHECK (
    target_providers IS NULL
    OR (
      array_length(target_providers, 1) >= 1
      AND target_providers <@ ARRAY['openai', 'gemini']::text[]
    )
  );

-- 推奨 provider は対応 provider に含まれること(両方指定時のみ検証)。
ALTER TABLE public.style_presets
  DROP CONSTRAINT IF EXISTS style_presets_recommended_in_target_check;
ALTER TABLE public.style_presets
  ADD CONSTRAINT style_presets_recommended_in_target_check
  CHECK (
    recommended_provider IS NULL
    OR target_providers IS NULL
    OR recommended_provider = ANY (target_providers)
  );

-- 申請(pending)の一覧用インデックス。
CREATE INDEX IF NOT EXISTS idx_style_presets_submitted_by_user_id
  ON public.style_presets (submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_style_presets_status
  ON public.style_presets (status);

COMMENT ON COLUMN public.style_presets.submitted_by_user_id IS 'クリエイター提供プロンプトの申請者 profiles.id。承認時に provider_user_id へ流用しクレジット表示する。';
COMMENT ON COLUMN public.style_presets.target_providers IS '対応モデル(openai / gemini の配列)。プレビューは選択分のみ生成。';
COMMENT ON COLUMN public.style_presets.recommended_provider IS '推奨モデル(openai / gemini)。ユーザー生成の既定に使う。target_providers の要素であること。';
COMMENT ON COLUMN public.style_presets.submission_consents IS 'クリエイター申請時の同意(JSONB)。全項目 true 必須(RPC で検証)。';
COMMENT ON COLUMN public.style_presets.preview_openai_image_url IS 'admin レビュー用 OpenAI プレビュー画像 URL(pending 時に運営テスト画像で生成)。';
COMMENT ON COLUMN public.style_presets.preview_gemini_image_url IS 'admin レビュー用 Gemini プレビュー画像 URL(pending 時に運営テスト画像で生成)。';

-- 3) クリエイター提供用の新規カテゴリ(初期 admin_only=fail-safe。運営確認後に public 化)。
--    visibility は 20260531020000 で追加済み。
INSERT INTO public.preset_categories
  (key, display_name_ja, display_name_en, badge_color, badge_text_color, skip_base_prefix, default_image_input_mode, display_order, visibility)
VALUES
  ('creator_prompts', 'クリエイター提供', 'Creator Prompts', '#b45309', '#ffffff', false, 'single', 20, 'admin_only')
ON CONFLICT (key) DO NOTHING;

COMMENT ON CONSTRAINT style_presets_status_check ON public.style_presets IS 'draft / pending(申請中) / published / rejected';
