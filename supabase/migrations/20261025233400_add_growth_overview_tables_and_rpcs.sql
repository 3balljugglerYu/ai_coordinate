BEGIN;

/*
  管理ダッシュボードの「概要」のための表2つと集計 RPC 5本。
  計画: docs/planning/admin-growth-overview-p1-p2-implementation-plan.md

  ## analytics_excluded_users

  集計から除くアカウントの一覧。env(ADMIN_USER_IDS / ADMIN_PREVIEW_USER_IDS) と
  admin_users には、外部審査用のアカウントや本人の Gmail の別名が入っていない。
  2026-10-26 の集計では、審査用の1件が新規登録の数にまざった。
  getOperatorUserIds() がこの表も読み、すべての集計で同じ一覧を使う。

  中身(どのアカウントか)はこのマイグレーションに書かない。適用後に承認を取って入れる。

  ## admin_timeline_events

  企画・広告・値段の改定・リリースなど「何かを変えた日」の印。
  日ごとのグラフに縦線で出し、変えた前と後を比べられるようにする。

  ## 権限

  ⚠️ Supabase は public の関数・表に、既定で anon と authenticated へ直接権限を渡す。
  `REVOKE ... FROM PUBLIC` だけでは閉じない(20260831110000 の前例)。
  表・関数とも PUBLIC / anon / authenticated から外し、service_role にだけ渡す。

  ## 集計を SQL に置く理由

  credit_transactions と image_jobs は 1,000行を大きく超える。行を取ってアプリで数えると、
  PostgREST の上限でエラーも出さずに過小になる(#579 / #580)。
  人ごとの行を返す関数も同じ上限に当たるので、1行のまとめか、上限つきの一覧だけを返す。
*/

-- ===============================================
-- 集計から除くアカウント
-- ===============================================
CREATE TABLE IF NOT EXISTS public.analytics_excluded_users (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL
    CONSTRAINT analytics_excluded_users_reason_length
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  added_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.analytics_excluded_users IS
  '管理ダッシュボードの集計から除くアカウント(内部・審査用など)。service_role だけが読み書きする。';

ALTER TABLE public.analytics_excluded_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.analytics_excluded_users FROM PUBLIC;
REVOKE ALL ON TABLE public.analytics_excluded_users FROM anon;
REVOKE ALL ON TABLE public.analytics_excluded_users FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analytics_excluded_users TO service_role;
-- policy は作らない(service_role は RLS を通らない。ほかのロールは何もできない)

-- ===============================================
-- 出来事の印
-- ===============================================
CREATE TABLE IF NOT EXISTS public.admin_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 日本時間の日付
  event_date date NOT NULL,
  kind text NOT NULL
    CONSTRAINT admin_timeline_events_kind_check
    CHECK (kind IN ('campaign', 'ad', 'pricing', 'release', 'notice', 'other')),
  title text NOT NULL
    CONSTRAINT admin_timeline_events_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  note text
    CONSTRAINT admin_timeline_events_note_length
    CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_timeline_events_event_date_idx
  ON public.admin_timeline_events (event_date);

COMMENT ON TABLE public.admin_timeline_events IS
  '管理ダッシュボードのグラフに出す出来事の印(企画・広告・値段・リリースなど)。service_role だけが読み書きする。';

ALTER TABLE public.admin_timeline_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_timeline_events FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_timeline_events FROM anon;
REVOKE ALL ON TABLE public.admin_timeline_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_timeline_events TO service_role;

-- updated_at auto-update trigger (既存パターン: 20260602100200)
CREATE OR REPLACE FUNCTION public.update_admin_timeline_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_admin_timeline_events_updated_at
  ON public.admin_timeline_events;
CREATE TRIGGER trg_update_admin_timeline_events_updated_at
  BEFORE UPDATE ON public.admin_timeline_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_admin_timeline_events_updated_at();

-- ===============================================
-- 使っている人
-- ===============================================
-- 使っている人 = 期間内に image_jobs が succeeded になった人、または本番の支払いをした人。
-- ⭐ generated_images では数えない。投稿していない画像は消せるので、消した人が減る。
-- ⭐ 支払いをした人も入れる。入れないと「生成せずに買った人」で課金した人の割合が100%を超える。
-- 期間内に登録した人(profiles.created_at >= p_start)と、それより前の人に分ける。
CREATE OR REPLACE FUNCTION public.get_growth_active_users(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  active_users bigint,
  active_new_users bigint,
  active_existing_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH active AS (
    SELECT j.user_id
    FROM public.image_jobs j
    WHERE j.status = 'succeeded'
      AND j.created_at >= p_start
      AND j.created_at < p_end
      AND j.user_id IS NOT NULL
    UNION
    SELECT t.user_id
    FROM public.credit_transactions t
    WHERE t.transaction_type IN ('purchase', 'subscription')
      AND t.metadata->>'mode' = 'live'
      AND t.created_at >= p_start
      AND t.created_at < p_end
      AND t.user_id IS NOT NULL
  )
  SELECT
    count(*) AS active_users,
    count(*) FILTER (WHERE p.created_at >= p_start) AS active_new_users,
    count(*) FILTER (WHERE p.created_at IS NULL OR p.created_at < p_start)
      AS active_existing_users
  FROM active a
  LEFT JOIN public.profiles p ON p.user_id = a.user_id
  WHERE NOT (a.user_id = ANY (coalesce(p_exclude_user_ids, '{}')));
$function$;

-- ===============================================
-- 使い道ごとの消費と返金
-- ===============================================
-- use_key の決め方:
--   1. metadata.source がガチャの分割・文字入力 → その値
--   2. metadata.job_id の image_jobs が failed → 'failed_job'
--   3. それ以外で image_jobs が見つかる → image_jobs.generation_type
--   4. どれでもない → 'other'
-- ⭐ related_generation_id には頼らない。worker は引くときに null を入れ、成功したときだけ埋める。
--    画像を消すと ON DELETE SET NULL で null に戻るので、成功した生成が「失敗」に見える。
-- 有料分は消費の from_paid と返金の to_paid を別に返す(正味はアプリで引く)。
CREATE OR REPLACE FUNCTION public.get_percoin_usage_breakdown(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  use_key text,
  consumed bigint,
  refunded bigint,
  paid_consumed bigint,
  paid_refunded bigint,
  tx_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH t AS (
    SELECT
      tx.transaction_type,
      tx.amount,
      tx.metadata,
      CASE
        WHEN tx.metadata->>'job_id'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (tx.metadata->>'job_id')::uuid
      END AS job_id
    FROM public.credit_transactions tx
    WHERE tx.transaction_type IN ('consumption', 'refund')
      AND tx.created_at >= p_start
      AND tx.created_at < p_end
      AND tx.user_id IS NOT NULL
      AND NOT (tx.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
  ),
  k AS (
    SELECT
      t.transaction_type,
      t.amount,
      t.metadata,
      CASE
        WHEN t.metadata->>'source' IN ('gacha_split_api', 'name_input_create_api')
          THEN t.metadata->>'source'
        WHEN j.id IS NULL THEN 'other'
        WHEN j.status = 'failed' THEN 'failed_job'
        ELSE coalesce(j.generation_type, 'other')
      END AS use_key
    FROM t
    LEFT JOIN public.image_jobs j ON j.id = t.job_id
  )
  SELECT
    k.use_key,
    coalesce(-sum(k.amount) FILTER (WHERE k.transaction_type = 'consumption'), 0)::bigint
      AS consumed,
    coalesce(sum(k.amount) FILTER (WHERE k.transaction_type = 'refund'), 0)::bigint
      AS refunded,
    coalesce(sum(
      CASE
        WHEN k.transaction_type = 'consumption'
         AND k.metadata->>'from_paid' ~ '^[0-9]+$'
          THEN (k.metadata->>'from_paid')::bigint
      END
    ), 0)::bigint AS paid_consumed,
    coalesce(sum(
      CASE
        WHEN k.transaction_type = 'refund'
         AND k.metadata->>'to_paid' ~ '^[0-9]+$'
          THEN (k.metadata->>'to_paid')::bigint
      END
    ), 0)::bigint AS paid_refunded,
    count(*) FILTER (WHERE k.transaction_type = 'consumption') AS tx_count
  FROM k
  GROUP BY k.use_key
  ORDER BY consumed DESC, k.use_key;
$function$;

-- ===============================================
-- 日ごとの出入り(日本時間の日付)
-- ===============================================
-- 無料 = amount > 0 で、purchase・subscription・refund 以外。
-- purchased は本番の支払い(metadata.mode = 'live')だけ。テスト・見本の支払いを入れない。
-- 動きのない日も0で返す(グラフが途切れないように)。
CREATE OR REPLACE FUNCTION public.get_percoin_daily_flow(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  day date,
  free_granted bigint,
  consumed bigint,
  refunded bigint,
  purchased bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(
      (p_start AT TIME ZONE 'Asia/Tokyo')::date::timestamp,
      ((p_end - interval '1 microsecond') AT TIME ZONE 'Asia/Tokyo')::date::timestamp,
      interval '1 day'
    ) AS g(d)
  ),
  t AS (
    SELECT
      (tx.created_at AT TIME ZONE 'Asia/Tokyo')::date AS day,
      tx.transaction_type,
      tx.amount,
      tx.metadata
    FROM public.credit_transactions tx
    WHERE tx.created_at >= p_start
      AND tx.created_at < p_end
      AND tx.user_id IS NOT NULL
      AND NOT (tx.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
  )
  SELECT
    days.day,
    coalesce(sum(t.amount) FILTER (
      WHERE t.amount > 0
        AND t.transaction_type NOT IN ('purchase', 'subscription', 'refund')
    ), 0)::bigint AS free_granted,
    coalesce(-sum(t.amount) FILTER (WHERE t.transaction_type = 'consumption'), 0)::bigint
      AS consumed,
    coalesce(sum(t.amount) FILTER (WHERE t.transaction_type = 'refund'), 0)::bigint
      AS refunded,
    coalesce(sum(t.amount) FILTER (
      WHERE t.transaction_type IN ('purchase', 'subscription')
        AND t.metadata->>'mode' = 'live'
        AND t.amount > 0
    ), 0)::bigint AS purchased
  FROM days
  LEFT JOIN t ON t.day = days.day
  GROUP BY days.day
  ORDER BY days.day;
$function$;

-- ===============================================
-- 消費した人ごとの数(中だけで使う)
-- ===============================================
-- 下の2本が共通で使う。外からは呼ばせない(service_role にも渡さない)。
-- 呼び出し元は SECURITY DEFINER(所有者の権限)で動くので、ここを呼べる。
--
-- consumed_net = 消費 − 返金(失敗の返金を引いた正味)
-- days_left    = 今の残高 ÷ (正味の消費 ÷ 期間の日数)。正味が0以下なら NULL(出さない)。
CREATE OR REPLACE FUNCTION public.growth_percoin_consumers(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  user_id uuid,
  consumed_net bigint,
  free_granted bigint,
  balance bigint,
  days_left numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH per AS (
    SELECT
      tx.user_id,
      (
        -coalesce(sum(tx.amount) FILTER (WHERE tx.transaction_type = 'consumption'), 0)
        - coalesce(sum(tx.amount) FILTER (WHERE tx.transaction_type = 'refund'), 0)
      )::bigint AS consumed_net,
      coalesce(sum(tx.amount) FILTER (
        WHERE tx.amount > 0
          AND tx.transaction_type NOT IN ('purchase', 'subscription', 'refund')
      ), 0)::bigint AS free_granted
    FROM public.credit_transactions tx
    WHERE tx.created_at >= p_start
      AND tx.created_at < p_end
      AND tx.user_id IS NOT NULL
      AND NOT (tx.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
    GROUP BY tx.user_id
    HAVING count(*) FILTER (WHERE tx.transaction_type = 'consumption') > 0
  )
  SELECT
    per.user_id,
    per.consumed_net,
    per.free_granted,
    coalesce(c.balance, 0)::bigint AS balance,
    CASE
      WHEN per.consumed_net > 0 THEN
        coalesce(c.balance, 0)::numeric
        / (
          per.consumed_net::numeric
          / greatest(extract(epoch FROM (p_end - p_start)) / 86400.0, 1.0 / 24.0)
        )
    END AS days_left
  FROM per
  LEFT JOIN public.user_credits c ON c.user_id = per.user_id;
$function$;

-- ===============================================
-- 消費した人のまとめ(1行)
-- ===============================================
-- 上位 p_top_n 人の正味の消費と、その人たちが無料でもらった量。
-- 残りの日数の分け方: 3日以内 / 3〜7日 / 7〜30日 / 30〜90日 / 90日より先
-- (境界は「以下」の側に入れる。例: ちょうど7日は runway_4_7)。
CREATE OR REPLACE FUNCTION public.get_percoin_consumer_summary(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}',
  p_top_n integer DEFAULT 10
)
RETURNS TABLE (
  consumer_count bigint,
  total_consumed_net bigint,
  top_count bigint,
  top_consumed_net bigint,
  top_free_granted bigint,
  runway_le3 bigint,
  runway_4_7 bigint,
  runway_8_30 bigint,
  runway_31_90 bigint,
  runway_gt90 bigint,
  non_positive_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH c AS (
    SELECT * FROM public.growth_percoin_consumers(p_start, p_end, p_exclude_user_ids)
  ),
  top AS (
    SELECT c.consumed_net, c.free_granted
    FROM c
    WHERE c.consumed_net > 0
    ORDER BY c.consumed_net DESC, c.user_id
    LIMIT greatest(coalesce(p_top_n, 10), 0)
  )
  SELECT
    (SELECT count(*) FROM c) AS consumer_count,
    (SELECT coalesce(sum(greatest(c.consumed_net, 0)), 0) FROM c)::bigint
      AS total_consumed_net,
    (SELECT count(*) FROM top) AS top_count,
    (SELECT coalesce(sum(top.consumed_net), 0) FROM top)::bigint AS top_consumed_net,
    (SELECT coalesce(sum(top.free_granted), 0) FROM top)::bigint AS top_free_granted,
    (SELECT count(*) FROM c WHERE c.days_left <= 3) AS runway_le3,
    (SELECT count(*) FROM c WHERE c.days_left > 3 AND c.days_left <= 7) AS runway_4_7,
    (SELECT count(*) FROM c WHERE c.days_left > 7 AND c.days_left <= 30) AS runway_8_30,
    (SELECT count(*) FROM c WHERE c.days_left > 30 AND c.days_left <= 90) AS runway_31_90,
    (SELECT count(*) FROM c WHERE c.days_left > 90) AS runway_gt90,
    (SELECT count(*) FROM c WHERE c.consumed_net <= 0) AS non_positive_count;
$function$;

-- ===============================================
-- 残りの日数が少ない人(上限つきの一覧)
-- ===============================================
-- 呼び出し側は「上限 + 1」で呼び、上限を超えたら「ほかにもいます」と出す。
CREATE OR REPLACE FUNCTION public.get_percoin_low_runway_users(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}',
  p_max_days numeric DEFAULT 3,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  user_id uuid,
  nickname text,
  balance bigint,
  consumed_net bigint,
  days_left numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    c.user_id,
    p.nickname,
    c.balance,
    c.consumed_net,
    round(c.days_left, 1) AS days_left
  FROM public.growth_percoin_consumers(p_start, p_end, p_exclude_user_ids) c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.days_left <= coalesce(p_max_days, 3)
  ORDER BY c.days_left ASC, c.user_id
  LIMIT greatest(least(coalesce(p_limit, 50), 200), 0);
$function$;

-- ===============================================
-- 権限
-- ===============================================
REVOKE ALL ON FUNCTION public.update_admin_timeline_events_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_admin_timeline_events_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.update_admin_timeline_events_updated_at() FROM authenticated;

REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM service_role;

REVOKE ALL ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_usage_breakdown(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_usage_breakdown(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_usage_breakdown(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_usage_breakdown(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_consumer_summary(timestamptz, timestamptz, uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_consumer_summary(timestamptz, timestamptz, uuid[], integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_consumer_summary(timestamptz, timestamptz, uuid[], integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_consumer_summary(timestamptz, timestamptz, uuid[], integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_low_runway_users(timestamptz, timestamptz, uuid[], numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_low_runway_users(timestamptz, timestamptz, uuid[], numeric, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_low_runway_users(timestamptz, timestamptz, uuid[], numeric, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_low_runway_users(timestamptz, timestamptz, uuid[], numeric, integer) TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.get_percoin_low_runway_users(timestamptz, timestamptz, uuid[], numeric, integer);
-- DROP FUNCTION IF EXISTS public.get_percoin_consumer_summary(timestamptz, timestamptz, uuid[], integer);
-- DROP FUNCTION IF EXISTS public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]);
-- DROP FUNCTION IF EXISTS public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]);
-- DROP FUNCTION IF EXISTS public.get_percoin_usage_breakdown(timestamptz, timestamptz, uuid[]);
-- DROP FUNCTION IF EXISTS public.get_growth_active_users(timestamptz, timestamptz, uuid[]);
-- DROP TRIGGER IF EXISTS trg_update_admin_timeline_events_updated_at ON public.admin_timeline_events;
-- DROP FUNCTION IF EXISTS public.update_admin_timeline_events_updated_at();
-- DROP TABLE IF EXISTS public.admin_timeline_events;
-- DROP TABLE IF EXISTS public.analytics_excluded_users;
-- ===============================================
