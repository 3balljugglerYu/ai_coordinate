-- 最初に来た場所と、最初に開いた画面を残す(管理ダッシュボード P3-3)
--   計画: docs/planning/admin-growth-p3-instrumentation-plan.md 5章
--
--   ## user_first_visits
--   登録した人ごとに、はじめてペルスタに来たときの「来た場所」と「最初に開いた画面のパス」を1行持つ。
--   ブラウザの cookie(persta_first_visit・30日・最初に来た時だけ)に残した値を、登録のときに書く。
--     - メールでの登録: 値を user_metadata に入れ、下の handle_new_user が写す
--     - OAuth での登録: /auth/callback がサーバーで書く(service_role)
--   来た場所は x_ad / x / meta(今の signup_source の見分け方と同じ)に、search / direct / other を足したもの。
--   signup_source(目印・企画の既定値)とは別に持ち、signup_source の動きは変えない。
--
--   計画では profiles に2列を足すはずだったが、profiles は「だれでも全部の列を読める」表
--   (SELECT の policy が true・anon にも表ごとの SELECT がある)なので、別の表にして
--   service_role だけが読めるようにした(どの画面から来たかを、ほかの人から見えないようにする)。
--
--   ## handle_new_user
--   20260817100000 の定義に、user_first_visits へ写す処理だけを足す。ほかは1文字も変えない。
--   写す処理は別の BEGIN で囲み、ここで失敗しても登録(profiles・ボーナス・通知)は止めない。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.user_first_visits (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL
    CONSTRAINT user_first_visits_channel_check
    CHECK (channel IN ('x_ad', 'x', 'meta', 'search', 'direct', 'other')),
  -- クエリ(?)と # のうしろは残さない
  landing_path text
    CONSTRAINT user_first_visits_landing_path_check
    CHECK (
      landing_path IS NULL
      OR (char_length(landing_path) <= 200 AND landing_path ~ '^/[^?#]*$')
    ),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_first_visits IS
  '登録した人の、最初に来た場所と最初に開いた画面(管理ダッシュボード P3-3)。service_role 専用';

ALTER TABLE public.user_first_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_first_visits FROM PUBLIC;
REVOKE ALL ON TABLE public.user_first_visits FROM anon;
REVOKE ALL ON TABLE public.user_first_visits FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_first_visits TO service_role;

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

  -- 書式は profiles_signup_source_check と一致させること。
  -- 値の許可リストは持たない(企画キー等の任意タグを受け入れるため)。
  v_signup_source := NULLIF(NEW.raw_user_meta_data->>'signup_source', '');
  IF v_signup_source IS NOT NULL
     AND v_signup_source !~ '^[a-z0-9_-]{1,40}$' THEN
    v_signup_source := NULL;
  END IF;

  INSERT INTO public.profiles (id, user_id, nickname, signup_source)
  VALUES (NEW.id, NEW.id, v_default_nickname, v_signup_source)
  ON CONFLICT (user_id) DO NOTHING;

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

COMMIT;

NOTIFY pgrst, 'reload schema';
