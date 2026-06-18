-- ===============================================
-- app_settings: アプリ全体のグローバル設定(key-value)
-- ===============================================
-- 専用のグローバル設定テーブルが無かったため新設する。
-- 初回用途: Creator Looks「2段階(衣装＋背景)生成モード」の公開レベルを
--   admin が UI から切り替えるための設定 creator_looks_two_stage_visibility。
--   値は 'admin_only'(admin/プレビューのみ表示) または 'public'(全員に表示)。
--   既定は 'admin_only'(= 機能フラグも兼ねる。検証後に public へ)。
--
-- 書き込みは admin API(service_role クライアント)経由のみを想定し、
-- 一般ユーザー(anon/authenticated)には INSERT/UPDATE/DELETE ポリシーを作らない(= 拒否)。
-- 読み取りは認証ユーザーに開放(UI が公開レベルを参照するため)。
-- ===============================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_settings IS 'アプリ全体のグローバル設定(key-value)。書き込みは admin(service_role)のみ';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 読み取り: 認証ユーザーに開放(公開レベルの参照に使う)
DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;
CREATE POLICY app_settings_select_authenticated
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 書き込みポリシーは作らない(= anon/authenticated は拒否)。
-- admin API は service_role クライアントで RLS をバイパスして更新する。

-- 初期値: Creator Looks 2段階モードは既定で admin_only(未公開)
INSERT INTO public.app_settings (key, value)
VALUES ('creator_looks_two_stage_visibility', 'admin_only')
ON CONFLICT (key) DO NOTHING;

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.app_settings;
-- ===============================================
