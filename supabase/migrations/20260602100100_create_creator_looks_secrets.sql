-- ===============================================
-- Creator Looks: user_style_template_secrets テーブル新規
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-001, ADR-009
--
-- このテーブルは Persta の moat (= meta-prompt 抽出結果) を保管するため、
-- クリエイター本人含むすべての authenticated / anon ロールから完全に遮断する。
-- アクセス可能なのは service_role と SECURITY DEFINER 関数 (get_creator_looks_secret_for_admin) のみ。

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_style_template_secrets (
  template_id UUID PRIMARY KEY
    REFERENCES public.user_style_templates(id) ON DELETE CASCADE,
  hidden_prompt TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  vlm_model TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_style_template_secrets IS
  'Creator Looks 投稿の隠し meta-prompt (= VLM 抽出結果)。service_role と SECURITY DEFINER 関数のみアクセス可';
COMMENT ON COLUMN public.user_style_template_secrets.template_id IS
  '紐づく user_style_templates.id (= 1:1 関係)';
COMMENT ON COLUMN public.user_style_template_secrets.hidden_prompt IS
  'gpt-5.5 Responses API が出力した構造化 outfit プロンプト (Styling Direction / Background / Constraints を含む)';
COMMENT ON COLUMN public.user_style_template_secrets.generator_version IS
  'meta-prompt テンプレートのバージョン (例: "creator-looks-v1.0")。チューニング後の再生成判定用';
COMMENT ON COLUMN public.user_style_template_secrets.vlm_model IS
  '抽出に使った VLM モデル名 (例: "gpt-5.5")';

-- RLS 有効化 + 全 grants REVOKE (= service_role のみアクセス可)
ALTER TABLE public.user_style_template_secrets ENABLE ROW LEVEL SECURITY;

-- すべての通常ロールを完全 deny
REVOKE ALL ON TABLE public.user_style_template_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.user_style_template_secrets FROM anon;
REVOKE ALL ON TABLE public.user_style_template_secrets FROM authenticated;

-- ポリシーは明示的に「すべてのアクションを deny」を 1 つだけ置く
-- (= ポリシー無し + RLS 有効でも同じ挙動だが、意図を明示化)
DROP POLICY IF EXISTS "user_style_template_secrets_no_public_access" ON public.user_style_template_secrets;
CREATE POLICY "user_style_template_secrets_no_public_access"
  ON public.user_style_template_secrets
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP POLICY IF EXISTS "user_style_template_secrets_no_public_access" ON public.user_style_template_secrets;
-- DROP TABLE IF EXISTS public.user_style_template_secrets;
-- COMMIT;
-- ===============================================
