-- ===============================================
-- Creator Looks: user_style_templates に列追加
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-002, ADR-013
--
-- 新規列:
--   is_creator_looks BOOLEAN NOT NULL DEFAULT false
--     Creator Looks 投稿か既存 Inspire 投稿かの区別フラグ
--   submission_source TEXT NULL
--     出所申告 ('self_created' / 'self_photographed' / 'licensed_other')
--   submission_consents JSONB NOT NULL DEFAULT '{}'::JSONB
--     同意チェック 5 項目 + バージョン
--   usage_count INTEGER NOT NULL DEFAULT 0
--     生成回数キャッシュ (= image_jobs 集計の denormalized 列)
--   posted_count INTEGER NOT NULL DEFAULT 0
--     ホーム投稿回数キャッシュ
--
-- CHECK 制約: 同一行で完結する条件のみ (ADR-013)
--   - submission_source は許可値のみ
--   - is_creator_looks=true かつ pending 以降は同意 5 項目 + 出所が必須
--   - admin_users / creator_looks_allowlist / user_style_template_secrets 参照は別 trigger / RPC で強制

BEGIN;

ALTER TABLE public.user_style_templates
  ADD COLUMN IF NOT EXISTS is_creator_looks BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submission_source TEXT,
  ADD COLUMN IF NOT EXISTS submission_consents JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posted_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_style_templates.is_creator_looks IS
  'Creator Looks 投稿フラグ。true なら meta-prompt 抽出 + 帰属表示 + 4 種類の通知トリガが発火する。既存 Inspire 投稿は false';
COMMENT ON COLUMN public.user_style_templates.submission_source IS
  '出所申告: self_created (自作) / self_photographed (自分で撮影) / licensed_other (許諾済み他者作品)';
COMMENT ON COLUMN public.user_style_templates.submission_consents IS
  '同意チェック JSONB: {"version":"1.0","acknowledged_at":"...","copyright":true,"third_party_ip":true,"secondary_use":true,"promo_use":true,"no_sensitive":true}';
COMMENT ON COLUMN public.user_style_templates.usage_count IS
  '生成回数の denormalized キャッシュ (= image_jobs から trigger で更新)';
COMMENT ON COLUMN public.user_style_templates.posted_count IS
  'ホーム投稿回数の denormalized キャッシュ';

-- submission_source の許可値 CHECK (= NULL も許可、Inspire 既存投稿は NULL のまま)
ALTER TABLE public.user_style_templates
  DROP CONSTRAINT IF EXISTS user_style_templates_submission_source_check;

ALTER TABLE public.user_style_templates
  ADD CONSTRAINT user_style_templates_submission_source_check
  CHECK (
    submission_source IS NULL
    OR submission_source IN ('self_created', 'self_photographed', 'licensed_other')
  );

-- Creator Looks 投稿は pending 以降で「出所必須 + 同意 5 項目すべて true」を CHECK で強制
ALTER TABLE public.user_style_templates
  DROP CONSTRAINT IF EXISTS user_style_templates_creator_looks_requires_consent;

ALTER TABLE public.user_style_templates
  ADD CONSTRAINT user_style_templates_creator_looks_requires_consent
  CHECK (
    is_creator_looks = false
    OR moderation_status = 'draft'
    OR (
      submission_source IS NOT NULL
      AND (submission_consents ? 'copyright')
      AND (submission_consents->>'copyright')::BOOLEAN = true
      AND (submission_consents ? 'third_party_ip')
      AND (submission_consents->>'third_party_ip')::BOOLEAN = true
      AND (submission_consents ? 'secondary_use')
      AND (submission_consents->>'secondary_use')::BOOLEAN = true
      AND (submission_consents ? 'promo_use')
      AND (submission_consents->>'promo_use')::BOOLEAN = true
      AND (submission_consents ? 'no_sensitive')
      AND (submission_consents->>'no_sensitive')::BOOLEAN = true
    )
  );

-- インデックス: Creator Looks 投稿の visible / pending / submitter 検索を高速化
CREATE INDEX IF NOT EXISTS idx_user_style_templates_creator_looks_visible
  ON public.user_style_templates (display_order ASC, created_at DESC)
  WHERE moderation_status = 'visible' AND is_creator_looks = true;

CREATE INDEX IF NOT EXISTS idx_user_style_templates_creator_looks_pending
  ON public.user_style_templates (created_at DESC)
  WHERE moderation_status = 'pending' AND is_creator_looks = true;

-- 投稿頻度制限の高速化用 (= 過去 24h カウントの seq scan を回避)
CREATE INDEX IF NOT EXISTS idx_user_style_templates_creator_looks_submitter_created
  ON public.user_style_templates (submitted_by_user_id, created_at DESC)
  WHERE is_creator_looks = true;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_user_style_templates_creator_looks_submitter_created;
-- DROP INDEX IF EXISTS idx_user_style_templates_creator_looks_pending;
-- DROP INDEX IF EXISTS idx_user_style_templates_creator_looks_visible;
-- ALTER TABLE public.user_style_templates DROP CONSTRAINT IF EXISTS user_style_templates_creator_looks_requires_consent;
-- ALTER TABLE public.user_style_templates DROP CONSTRAINT IF EXISTS user_style_templates_submission_source_check;
-- ALTER TABLE public.user_style_templates
--   DROP COLUMN IF EXISTS posted_count,
--   DROP COLUMN IF EXISTS usage_count,
--   DROP COLUMN IF EXISTS submission_consents,
--   DROP COLUMN IF EXISTS submission_source,
--   DROP COLUMN IF EXISTS is_creator_looks;
-- COMMIT;
-- ===============================================
