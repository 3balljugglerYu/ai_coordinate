-- 見本（参照画像）の「使える見本・使えない見本」への同意を、本人ごとにサーバーに残す（i2i カタログ 段階6b-1）
-- 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
--
-- 第2案では、同意の画面を、見本を初めて選んだときだけ出す。「わかりました」を押した時刻を、ここに本人ごとに残す。
-- - 見本を上げる API は、ここに有効な同意があるときだけ受け付け、見本の行（catalog_reference_images.copyright_consent_at）に
--   この時刻を写す（同意の画面を出していない時刻を、同意の時刻として残さない）
-- - 本人の見本が、この時刻よりあとに作り直しになったら、同意の画面をもう一度出す（判定はアプリ。もう一度同意すると時刻を書き換える）
-- - 書くのも読むのもサーバー（service role）だけ。利用者には権限を渡さない
-- 一般の利用者には影響しない（見本を使える人が同意したときだけ行ができる）

CREATE TABLE IF NOT EXISTS public.catalog_reference_consents (
  user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_reference_consents IS
  '見本の「使える見本・使えない見本」に同意した記録（本人ごとに1行）。書くのはサーバーだけ';
COMMENT ON COLUMN public.catalog_reference_consents.consented_at IS
  'いちばん新しく同意した時刻（作り直しのあとにもう一度同意すると書き換える）';

ALTER TABLE public.catalog_reference_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_reference_consents FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_reference_consents FROM anon;
REVOKE ALL ON TABLE public.catalog_reference_consents FROM authenticated;
