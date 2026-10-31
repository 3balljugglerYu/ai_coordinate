-- 見本（参照画像）の「使える見本・使えない見本」への同意を、本人ごとにサーバーに残す（i2i カタログ 段階6b-1）
-- 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
--
-- 第2案では、同意の画面を、有効な同意が無い人にだけ、見本を選んだ直後に出す。「わかりました」を押した時刻を、ここに本人ごとに残す。
-- - 見本の行（catalog_reference_images）を作るときに、DB が有効な同意を確かめ、copyright_consent_at にその時刻を写す
--   （有効な同意が無ければ作らない。同意の画面を出していない時刻を、同意の時刻として残さない。API の先の確かめは早く断るため）
-- - 本人の見本が作り直しになったら（rejected_at が入ったら）、同じトランザクションで同意を無効にする（行は消さず revoked_at を入れる）。
--   無効の間は、同意の画面をもう一度出す。もう一度同意すると、時刻を書き換えて無効の印を外す
-- - 時刻はどれも DB の now() で書く（アプリのサーバーの時計と混ぜない）
-- - 書くのも読むのもサーバー（service role）だけ。利用者には権限を渡さない
-- - 6a（毎回のチェック）で見本を上げた人は同意済みとして移す（いちばん新しいチェックの時刻。そのあと作り直しがあれば無効）
-- 一般の利用者には影響しない（見本を使える人が同意したときだけ行ができる）

-- -----------------------------------------------
-- 1. 同意の表
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_reference_consents (
  user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同意のあとに本人の見本が作り直しになった時刻。入っている間は、同意がもう一度要る
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_reference_consents IS
  '見本の「使える見本・使えない見本」に同意した記録（本人ごとに1行）。書くのはサーバーだけ';
COMMENT ON COLUMN public.catalog_reference_consents.consented_at IS
  'いちばん新しく同意した時刻（もう一度同意すると書き換える）';
COMMENT ON COLUMN public.catalog_reference_consents.revoked_at IS
  '同意のあとに本人の見本が作り直しになった時刻。入っている間は同意がもう一度要る';

ALTER TABLE public.catalog_reference_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_reference_consents FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_reference_consents FROM anon;
REVOKE ALL ON TABLE public.catalog_reference_consents FROM authenticated;

-- -----------------------------------------------
-- 2. 同意を残す（もう一度同意したら時刻を書き換え、無効の印を外す）
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.record_catalog_reference_consent(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.catalog_reference_consents AS c (user_id, consented_at, revoked_at)
  VALUES (p_user_id, now(), NULL)
  ON CONFLICT (user_id) DO UPDATE SET consented_at = now(), revoked_at = NULL
  RETURNING c.consented_at;
$$;

REVOKE ALL ON FUNCTION public.record_catalog_reference_consent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catalog_reference_consent(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_catalog_reference_consent(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_catalog_reference_consent(uuid) TO service_role;

-- -----------------------------------------------
-- 3. 見本が作り直しになったら、その人の同意を無効にする
-- -----------------------------------------------
-- rejected_at を書く道（今は apply_catalog_review_decision）が増えても漏れないように、表のトリガーで受ける
CREATE OR REPLACE FUNCTION public.revoke_catalog_reference_consent_on_reject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.catalog_reference_consents
     SET revoked_at = now()
   WHERE user_id = NEW.user_id
     AND revoked_at IS NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_catalog_reference_consent_on_reject() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_catalog_reference_consent_on_reject() FROM anon;
REVOKE ALL ON FUNCTION public.revoke_catalog_reference_consent_on_reject() FROM authenticated;

CREATE OR REPLACE TRIGGER trg_revoke_catalog_reference_consent_on_reject
  AFTER UPDATE OF rejected_at ON public.catalog_reference_images
  FOR EACH ROW
  WHEN (OLD.rejected_at IS NULL AND NEW.rejected_at IS NOT NULL)
  EXECUTE FUNCTION public.revoke_catalog_reference_consent_on_reject();

-- -----------------------------------------------
-- 4. 見本の行を作るときに、有効な同意を確かめて時刻を写す
-- -----------------------------------------------
-- 同意の行を FOR SHARE で読むので、同じ人の作り直し（同意を無効にする UPDATE）とは順番に進む
CREATE OR REPLACE FUNCTION public.apply_catalog_reference_consent_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_consented_at timestamptz;
BEGIN
  SELECT c.consented_at
    INTO v_consented_at
    FROM public.catalog_reference_consents AS c
   WHERE c.user_id = NEW.user_id
     AND c.revoked_at IS NULL
     FOR SHARE;
  IF v_consented_at IS NULL THEN
    RAISE EXCEPTION 'CATALOG_REFERENCE_CONSENT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  NEW.copyright_consent_at := v_consented_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_catalog_reference_consent_on_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_catalog_reference_consent_on_insert() FROM anon;
REVOKE ALL ON FUNCTION public.apply_catalog_reference_consent_on_insert() FROM authenticated;

-- -----------------------------------------------
-- 5. 6a で見本を上げた人を、同意済みとして移す
-- -----------------------------------------------
-- 6a は上げるたびにチェックで同意を取っていたので、いちばん新しいチェックの時刻を同意の時刻にする。
-- そのあとに本人の見本が作り直しになっていれば、無効にしておく（同意の画面をもう一度出す）。
-- 「そのあと」は DB の時計どうしで比べる（copyright_consent_at は 6a のアプリの時計なので、行を作った created_at と比べる）。
-- トリガー（4）を付ける前に移す（今ある見本の行は書き換えない）
INSERT INTO public.catalog_reference_consents (user_id, consented_at, revoked_at)
SELECT
  r.user_id,
  max(r.copyright_consent_at),
  CASE
    WHEN max(r.rejected_at) > max(r.created_at) THEN max(r.rejected_at)
  END
FROM public.catalog_reference_images AS r
GROUP BY r.user_id
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE TRIGGER trg_apply_catalog_reference_consent_on_insert
  BEFORE INSERT ON public.catalog_reference_images
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_catalog_reference_consent_on_insert();
