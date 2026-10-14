-- ===============================================
-- アプリのプッシュ通知: 端末の宛先とプッシュの設定
-- ===============================================
-- 計画書: docs/planning/push-notifications-implementation-plan.md
--         Phase 1 / ADR-005, ADR-008, ADR-009 / REQ-007, REQ-008, REQ-015
--
-- 【push_device_tokens】
-- アプリ(iOS / Android)の FCM の宛先。1 台の端末は同時に 1 人の利用者にだけ
-- 結びつく(同じ端末で別のアカウントにログインし直したら付け替える)。
-- 付け替えは他人の行の削除を伴い RLS では書けないため、書き込みは
-- register_push_device / unregister_push_device の RPC だけに絞る(本人の行は
-- SELECT だけ直接許す)。
--
-- 【push_preferences】
-- 種類ごとのオン・オフは「プッシュ通知だけ」を止める(アプリの通知タブの中身は
-- 変えない)。既存の notification_preferences はオフにすると通知の記録自体を
-- しないので、別の表にする(ADR-005)。行が無い人は既定値で扱う。
--
-- 【push_subscriptions の削除】
-- 2025-12 の通知の初期構築で「将来用」に作られたまま未使用(本番 0 行・
-- アプリ/Web とも参照なし。2026-10-13 確認)。名前が Web Push とサブスク(課金)と
-- 紛らわしいため削除し、push_device_tokens に置き換える(ADR-008, ユーザー決定)。

BEGIN;

-- -----------------------------------------------
-- push_subscriptions を削除
-- -----------------------------------------------
DO $do$
DECLARE
  v_rows BIGINT;
BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.push_subscriptions' INTO v_rows;
    -- 使われていないことを前提にした削除。行があれば止める(想定外のため)。
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'push_subscriptions has % rows; refusing to drop', v_rows;
    END IF;
    DROP TABLE public.push_subscriptions;
  END IF;
END;
$do$;

-- -----------------------------------------------
-- push_device_tokens
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- アプリがインストールごとに1回作って保存する識別子
  device_id TEXT NOT NULL CHECK (char_length(device_id) BETWEEN 1 AND 128),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  -- FCM の登録トークン
  token TEXT NOT NULL CHECK (char_length(token) BETWEEN 1 AND 4096),
  app_version TEXT CHECK (app_version IS NULL OR char_length(app_version) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1 台の端末・1 つのトークンは、同時に 1 人にだけ結びつく
  CONSTRAINT push_device_tokens_device_id_key UNIQUE (device_id),
  CONSTRAINT push_device_tokens_token_key UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user
  ON public.push_device_tokens (user_id);

COMMENT ON TABLE public.push_device_tokens IS
  'アプリ(iOS/Android)の FCM の宛先。書き込みは register_push_device / unregister_push_device の RPC だけ。送信関数(service role)が読み、無効になった宛先を消す。';

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_device_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.push_device_tokens TO authenticated;

DROP POLICY IF EXISTS "Users can read their own push devices"
  ON public.push_device_tokens;
CREATE POLICY "Users can read their own push devices"
  ON public.push_device_tokens
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 端末を登録する(同じ端末・同じトークンが別の人に結びついていたら付け替える)
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_device_id TEXT,
  p_platform TEXT,
  p_token TEXT,
  p_app_version TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- 利用者はセッションからだけ決める(引数で受け取らない)
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'register_push_device_not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- 別の人に結びついていた同じ端末・同じトークンを外す
  DELETE FROM public.push_device_tokens
  WHERE (device_id = p_device_id OR token = p_token)
    AND user_id <> v_user_id;

  -- 本人の行で、端末は同じだがトークンが変わった/トークンは同じだが端末が違う、
  -- の重複も1行にまとめる
  DELETE FROM public.push_device_tokens
  WHERE user_id = v_user_id
    AND token = p_token
    AND device_id <> p_device_id;

  -- 上の DELETE とこの INSERT のあいだに別の人が同じ端末を登録していても、
  -- 最後に登録した人の行にする(user_id も付け替える)
  INSERT INTO public.push_device_tokens (
    user_id, device_id, platform, token, app_version, last_seen_at
  ) VALUES (
    v_user_id, p_device_id, p_platform, p_token, p_app_version, now()
  )
  ON CONFLICT (device_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      token = EXCLUDED.token,
      app_version = EXCLUDED.app_version,
      last_seen_at = now();
END;
$$;

COMMENT ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT) IS
  'ログイン中の利用者の端末の FCM 宛先を登録・更新する。同じ端末・同じトークンが別の利用者に結びついていたら付け替える (ADR-008, ADR-009 / REQ-007)。';

REVOKE ALL ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

-- この端末の宛先を消す(ログアウトの直前に呼ぶ)
CREATE OR REPLACE FUNCTION public.unregister_push_device(
  p_device_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unregister_push_device_not_authenticated' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_device_tokens
  WHERE user_id = v_user_id
    AND device_id = p_device_id;
END;
$$;

COMMENT ON FUNCTION public.unregister_push_device(TEXT) IS
  'ログイン中の利用者の、この端末の宛先を消す。ログアウトの直前に呼ぶ (REQ-008)。';

REVOKE ALL ON FUNCTION public.unregister_push_device(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(TEXT) TO authenticated;

-- -----------------------------------------------
-- push_preferences
-- -----------------------------------------------
-- 種類の一覧(計画書 §0「送る種類と既定値」)。既定値は push_category_default。
CREATE OR REPLACE FUNCTION public.push_category_default(p_category TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_category
    WHEN 'likes' THEN true
    WHEN 'comments' THEN true
    WHEN 'follows' THEN true
    WHEN 'generation' THEN true
    WHEN 'creator_activity' THEN true
    WHEN 'percoin' THEN true
    WHEN 'moderation' THEN true
    WHEN 'pickup' THEN true
    WHEN 'unlock' THEN true
    WHEN 'following_posts' THEN false
    WHEN 'announcements' THEN false
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.push_category_default(TEXT) IS
  'プッシュ通知の種類ごとの既定値。知らない種類は NULL (計画書 §0)。';

-- categories は {"likes": false, ...} の形で、既定値と違うものだけを持つ
CREATE OR REPLACE FUNCTION public.push_categories_valid(p_categories JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(p_categories) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(p_categories) AS e(key, value)
      WHERE public.push_category_default(e.key) IS NULL
         OR jsonb_typeof(e.value) <> 'boolean'
    );
$$;

CREATE TABLE IF NOT EXISTS public.push_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 全体のオン・オフ
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- 種類ごとの上書き(既定値と違うものだけ)
  categories JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (public.push_categories_valid(categories)),
  -- 通知を止める時間帯(現地時刻)。両方あるか両方無いか。開始 > 終了 は日付またぎ
  quiet_start TIME,
  quiet_end TIME,
  -- 止める時間帯を判定するタイムゾーン(IANA 名。端末のもの)
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo'
    CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  -- 一時停止の終わり。これより前は送らない
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_preferences_quiet_pair_check CHECK (
    (quiet_start IS NULL) = (quiet_end IS NULL)
  )
);

COMMENT ON TABLE public.push_preferences IS
  'プッシュ通知の設定(本人だけ)。オフにして止まるのはプッシュだけで、通知タブの中身は変わらない (ADR-005)。行が無い人は既定値。';

-- タイムゾーン名の確認(pg_timezone_names は IMMUTABLE ではないので CHECK にできない)
CREATE OR REPLACE FUNCTION public.push_preferences_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'push_preferences_invalid_time_zone' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_preferences_validate ON public.push_preferences;
CREATE TRIGGER trg_push_preferences_validate
  BEFORE INSERT OR UPDATE ON public.push_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.push_preferences_validate();

ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_preferences TO authenticated;

DROP POLICY IF EXISTS "Users can manage their own push preferences"
  ON public.push_preferences;
CREATE POLICY "Users can manage their own push preferences"
  ON public.push_preferences
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 送信時の判定: その人にその種類を今送ってよいか
-- (全体オフ・種類オフ・一時停止中・止める時間帯の中 なら false)
CREATE OR REPLACE FUNCTION public.push_allowed_now(
  p_user_id UUID,
  p_category TEXT,
  p_now TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pref public.push_preferences%ROWTYPE;
  v_local TIME;
  v_enabled BOOLEAN;
BEGIN
  SELECT * INTO v_pref FROM public.push_preferences WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN COALESCE(public.push_category_default(p_category), false);
  END IF;

  IF NOT v_pref.enabled THEN
    RETURN false;
  END IF;

  v_enabled := COALESCE(
    (v_pref.categories ->> p_category)::BOOLEAN,
    public.push_category_default(p_category),
    false
  );
  IF NOT v_enabled THEN
    RETURN false;
  END IF;

  IF v_pref.paused_until IS NOT NULL AND p_now < v_pref.paused_until THEN
    RETURN false;
  END IF;

  IF v_pref.quiet_start IS NOT NULL AND v_pref.quiet_start <> v_pref.quiet_end THEN
    v_local := (p_now AT TIME ZONE v_pref.time_zone)::TIME;
    IF v_pref.quiet_start < v_pref.quiet_end THEN
      -- 例: 13:00〜15:00
      IF v_local >= v_pref.quiet_start AND v_local < v_pref.quiet_end THEN
        RETURN false;
      END IF;
    ELSE
      -- 日付またぎ。例: 23:00〜8:00
      IF v_local >= v_pref.quiet_start OR v_local < v_pref.quiet_end THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.push_allowed_now(UUID, TEXT, TIMESTAMPTZ) IS
  'その人にその種類のプッシュを今送ってよいか。全体オフ・種類オフ・一時停止中・止める時間帯の中なら false (REQ-004, REQ-005)。送信関数(service role)が使う。';

REVOKE ALL ON FUNCTION public.push_allowed_now(UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_allowed_now(UUID, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
--   DROP FUNCTION IF EXISTS public.push_allowed_now(UUID, TEXT, TIMESTAMPTZ);
--   DROP TABLE IF EXISTS public.push_preferences;
--   DROP FUNCTION IF EXISTS public.push_preferences_validate();
--   DROP FUNCTION IF EXISTS public.push_categories_valid(JSONB);
--   DROP FUNCTION IF EXISTS public.push_category_default(TEXT);
--   DROP FUNCTION IF EXISTS public.unregister_push_device(TEXT);
--   DROP FUNCTION IF EXISTS public.register_push_device(TEXT, TEXT, TEXT, TEXT);
--   DROP TABLE IF EXISTS public.push_device_tokens;
--   (push_subscriptions は未使用だったため戻さない)
-- ===============================================
