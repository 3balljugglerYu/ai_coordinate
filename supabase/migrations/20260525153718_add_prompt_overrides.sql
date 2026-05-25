-- admin 編集可能な生成 prompt の override 文言を保持する。
-- コード default + DB override のフォールバック設計。
-- 既存類似パターン: supabase/migrations/20260322100000_add_style_presets.sql
-- 詳細: docs/planning/admin-generation-prompt-editor-plan.md

CREATE TABLE IF NOT EXISTS public.prompt_overrides (
  prompt_key TEXT PRIMARY KEY CHECK (length(prompt_key) <= 100),
  -- defense in depth: API 層でも 4000 文字制限するが、DB 側にも保険
  content TEXT NOT NULL CHECK (length(content) <= 4000 AND length(trim(content)) > 0),
  -- user 削除時に attribution だけ NULL に (style_presets / admin_announcements パターン)
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_overrides ENABLE ROW LEVEL SECURITY;

-- RLS: 既存 admin-only テーブル (admin_audit_log / admin_users) と同パターン。
-- USING(false) で anon / authenticated 全拒否。admin client (service role) のみアクセス可。
DROP POLICY IF EXISTS "prompt_overrides_no_public_access" ON public.prompt_overrides;
CREATE POLICY "prompt_overrides_no_public_access"
  ON public.prompt_overrides
  FOR ALL
  USING (false);

-- updated_at trigger: リポジトリ共通の update_updated_at_column() を利用
-- (style_presets / popup_banners と同パターン)
DROP TRIGGER IF EXISTS update_prompt_overrides_updated_at ON public.prompt_overrides;
CREATE TRIGGER update_prompt_overrides_updated_at
  BEFORE UPDATE ON public.prompt_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- COMMENT: スキーマ自己ドキュメント化 (style_presets と同レベルの粒度)
COMMENT ON TABLE public.prompt_overrides IS
  'admin 編集可能な生成 prompt の override 文言。コード default + DB override のフォールバック設計。詳細: docs/planning/admin-generation-prompt-editor-plan.md';
COMMENT ON COLUMN public.prompt_overrides.prompt_key IS
  'shared/generation/prompt-registry.ts に定義された key のいずれか (registry を真とする)';
COMMENT ON COLUMN public.prompt_overrides.content IS
  '{{varname}} プレースホルダー記法でテンプレ変数を含む prompt テキスト。max 4000 文字';
COMMENT ON COLUMN public.prompt_overrides.created_by IS
  '初回 override を作成した admin ユーザー id。ユーザー削除で NULL';
COMMENT ON COLUMN public.prompt_overrides.updated_by IS
  '最終更新 admin ユーザー id。ユーザー削除で NULL';
