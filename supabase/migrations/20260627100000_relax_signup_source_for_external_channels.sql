-- S3 計測修復: signup_source(流入元タグ)を外部チャネル(X 等)でも記録できるようにする。
--
-- 背景: これまで CHECK 制約が値リスト('style','wardrobe')に限定され、外部チャネルの
--   タグ(x_profile 等)が弾かれて NULL になり、流入元の 95% が欠損していた。
-- 変更: 固定値リストの CHECK を「書式チェック(小文字英数 + _ -, 1..40文字)」に緩和する。
--   既存の 'style' / 'wardrobe' は引き続き有効。アプリ側(parseSignupSource)でも同じ書式で
--   サニタイズしてから保存する。
-- 注: 追加的・後方互換(既存値は全て新 CHECK を満たす)。本作業では適用しない方針(最終確認のうえ一緒に適用)。

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_signup_source_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_signup_source_check
  CHECK (signup_source IS NULL OR signup_source ~ '^[a-z0-9_-]{1,40}$');

COMMENT ON COLUMN public.profiles.signup_source IS
  '流入元タグ(小文字英数 + _ -、1..40文字)。代表値: style / wardrobe。外部チャネル例: x_profile, x_post_20260627, instagram。';

COMMIT;
