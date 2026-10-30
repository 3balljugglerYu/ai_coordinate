-- 登録した経路(signup_source)を、運営だけが読める表に移す
--   2026-10-30 ユーザー「A: 直す」
--
--   profiles は「だれでも全部の列を読める」表(SELECT の policy が true・anon にも表ごとの SELECT がある)。
--   そこに signup_source(どの企画・どのページ・どの広告から登録したか)があり、ログインしていない人にも
--   見えていた。名前やメールは入っていないが、だれが広告から来たかが分かる。
--   20261030100000 の user_first_visits と同じく、service_role だけが読み書きできる表に移す。
--
--   ## この移行でやること(1回目)
--   - user_signup_sources を作り、profiles.signup_source の値を写す(signed_up_at は profiles.created_at)
--   - profiles.signup_source を空にする(updated_at は変えない)
--   - 書く所を新しい表に向ける: handle_new_user・record_signup_source(/auth/callback が呼ぶ)
--   - 読む所を新しい表に向ける: get_ad_signup_funnel・list_recent_signup_sources
--   - 切り替えの間に古いコード(/auth/callback が profiles を update する)が書いても、
--     トリガーで新しい表に移して profiles は空のままにする(divert_profile_signup_source)
--
--   ## あとでやること(2回目・新しいコードが出たあと)
--   profiles.signup_source の列・CHECK・上のトリガーと関数を消す。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.user_signup_sources (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 書式は今までの profiles_signup_source_check と同じ(値の許可リストは持たない)
  signup_source text NOT NULL
    CONSTRAINT user_signup_sources_signup_source_check
    CHECK (signup_source ~ '^[a-z0-9_-]{1,40}$'),
  -- 登録した時刻(profiles.created_at と同じ値)。管理画面の日ごとの集計に使う
  signed_up_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_signup_sources_source_signed_up_at_idx
  ON public.user_signup_sources (signup_source, signed_up_at);
CREATE INDEX IF NOT EXISTS user_signup_sources_signed_up_at_idx
  ON public.user_signup_sources (signed_up_at);

COMMENT ON TABLE public.user_signup_sources IS
  '登録した人の、登録した経路(企画・ページ・広告の目印)。最初の1つだけ持つ。service_role 専用';

ALTER TABLE public.user_signup_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_signup_sources FROM PUBLIC;
REVOKE ALL ON TABLE public.user_signup_sources FROM anon;
REVOKE ALL ON TABLE public.user_signup_sources FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_signup_sources TO service_role;

-- 今の値を写す
INSERT INTO public.user_signup_sources (user_id, signup_source, signed_up_at)
SELECT p.user_id, p.signup_source, p.created_at
FROM public.profiles AS p
WHERE p.signup_source IS NOT NULL
  AND p.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- profiles からは消す。updated_at は登録した経路と関係ないので、更新時刻のトリガーを止めて変えない
ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_updated_at;
UPDATE public.profiles SET signup_source = NULL WHERE signup_source IS NOT NULL;
ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_updated_at;

-- 登録した経路を1つ書く(すでにあれば書き直さない)。書けたら true
CREATE OR REPLACE FUNCTION public.record_signup_source(
  p_user_id uuid,
  p_signup_source text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_signup_source IS NULL OR p_signup_source !~ '^[a-z0-9_-]{1,40}$' THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_signup_sources (user_id, signup_source, signed_up_at)
  SELECT p.user_id, p_signup_source, p.created_at
  FROM public.profiles AS p
  WHERE p.user_id = p_user_id
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_signup_source(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_signup_source(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_signup_source(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_signup_source(uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_signup_source(uuid, text) IS
  '登録した経路を user_signup_sources に1つ書く(すでにあれば書かない・書式が合わなければ false)。登録した時刻は profiles.created_at。service_role のみ';

-- 切り替えの間の古いコードの書き込みを、新しい表に移す(profiles には残さない)。2回目で消す
CREATE OR REPLACE FUNCTION public.divert_profile_signup_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.signup_source IS NOT NULL THEN
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.user_signup_sources (user_id, signup_source, signed_up_at)
      VALUES (NEW.user_id, NEW.signup_source, COALESCE(NEW.created_at, now()))
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
    NEW.signup_source := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.divert_profile_signup_source() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.divert_profile_signup_source() FROM anon;
REVOKE ALL ON FUNCTION public.divert_profile_signup_source() FROM authenticated;

DROP TRIGGER IF EXISTS trg_divert_profile_signup_source ON public.profiles;
CREATE TRIGGER trg_divert_profile_signup_source
  BEFORE INSERT OR UPDATE OF signup_source ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.divert_profile_signup_source();

COMMENT ON COLUMN public.profiles.signup_source IS
  '使わない(20261030160000 で user_signup_sources に移した。だれでも読める表なので、ここには書かない)。新しいコードが出たら消す';

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_default_nickname text;
  v_signup_bonus integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_signup_source text;
  v_first_visit_channel text;
  v_first_landing_path text;
BEGIN
  v_signup_bonus := get_percoin_bonus_default('signup_bonus');

  IF NEW.email IS NOT NULL THEN
    v_default_nickname := split_part(NEW.email, '@', 1);
    IF length(v_default_nickname) > 20 THEN
      v_default_nickname := left(v_default_nickname, 20);
    END IF;
  END IF;

  -- 書式は user_signup_sources_signup_source_check と一致させること。
  -- 値の許可リストは持たない(企画キー等の任意タグを受け入れるため)。
  v_signup_source := NULLIF(NEW.raw_user_meta_data->>'signup_source', '');
  IF v_signup_source IS NOT NULL
     AND v_signup_source !~ '^[a-z0-9_-]{1,40}$' THEN
    v_signup_source := NULL;
  END IF;

  INSERT INTO public.profiles (id, user_id, nickname)
  VALUES (NEW.id, NEW.id, v_default_nickname)
  ON CONFLICT (user_id) DO NOTHING;

  -- 登録した経路は、だれでも読める profiles ではなく user_signup_sources に書く。
  -- ここで何が起きても登録は止めない(下の最初に来た場所と同じく、別の BEGIN で囲む)。
  IF v_signup_source IS NOT NULL THEN
    BEGIN
      PERFORM public.record_signup_source(NEW.id, v_signup_source);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Error recording signup source: %', SQLERRM;
    END;
  END IF;

  -- 最初に来た場所と最初に開いた画面(管理ダッシュボード P3-3)。
  -- 来た場所の値の決まりは表の CHECK だけに持つ(合わなければ下の EXCEPTION で捨てる)。
  -- パスは、合わなければパスだけを捨てて行は残すので、ここで先に確かめる。
  -- ここで何が起きても登録は止めない: この関数の最後の EXCEPTION に落ちると、
  -- 上の profiles などの INSERT まで取り消されるので、別の BEGIN で囲んでこの中だけで握りつぶす。
  BEGIN
    v_first_visit_channel := NULLIF(NEW.raw_user_meta_data->>'first_visit_channel', '');
    v_first_landing_path := NULLIF(NEW.raw_user_meta_data->>'first_landing_path', '');
    IF v_first_landing_path IS NOT NULL
       AND (char_length(v_first_landing_path) > 200 OR v_first_landing_path !~ '^/[^?#]*$') THEN
      v_first_landing_path := NULL;
    END IF;
    IF v_first_visit_channel IS NOT NULL THEN
      INSERT INTO public.user_first_visits (user_id, channel, landing_path)
      VALUES (NEW.id, v_first_visit_channel, v_first_landing_path)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error recording first visit: %', SQLERRM;
  END;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    NEW.id,
    v_signup_bonus,
    'signup_bonus',
    jsonb_build_object('bucket', 'promo')
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (NEW.id, v_signup_bonus, v_signup_bonus, now(), v_expire_at, 'signup_bonus', v_tx_id);

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (NEW.id, v_signup_bonus, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_signup_bonus, updated_at = NOW();

  BEGIN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      title,
      body,
      data,
      is_read,
      created_at
    ) VALUES (
      NEW.id,
      NEW.id,
      'bonus',
      'user',
      NEW.id,
      '新規登録ボーナス獲得！',
      '新規登録特典として' || v_signup_bonus || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_signup_bonus,
        'bonus_type', 'signup_bonus',
        'granted_at', NOW()
      ),
      false,
      NOW()
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error creating signup bonus notification: %', SQLERRM;
  END;

  BEGIN
    PERFORM generate_referral_code(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error generating referral code: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ad_signup_funnel(p_windows jsonb, p_exclude_user_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(signup_source text, signups bigint, generated bigint, posted bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH windows AS (
    SELECT
      w->>'signup_source' AS source,
      (w->>'from_date')::date AS from_date,
      (w->>'to_date')::date AS to_date
    FROM jsonb_array_elements(COALESCE(p_windows, '[]'::jsonb)) AS w
  ),
  users AS (
    SELECT DISTINCT windows.source, s.user_id
    FROM windows
    JOIN public.user_signup_sources AS s
      ON s.signup_source = windows.source
     AND (s.signed_up_at AT TIME ZONE 'Asia/Tokyo')::date BETWEEN windows.from_date AND windows.to_date
    WHERE NOT (s.user_id = ANY (COALESCE(p_exclude_user_ids, '{}'::uuid[])))
  )
  SELECT
    users.source,
    count(*),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.image_jobs AS j
      WHERE j.user_id = users.user_id AND j.status = 'succeeded'
    )),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.generated_images AS g
      WHERE g.user_id = users.user_id AND g.is_posted
    ))
  FROM users
  GROUP BY users.source;
$function$;

CREATE OR REPLACE FUNCTION public.list_recent_signup_sources(p_since timestamp with time zone)
 RETURNS TABLE(signup_source text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT s.signup_source
  FROM public.user_signup_sources AS s
  WHERE s.signed_up_at >= p_since
  ORDER BY 1;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
