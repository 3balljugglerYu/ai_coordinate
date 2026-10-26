BEGIN;

/*
  20261025233400 の集計の関数を3つ直す(#804 のレビューで見つかったもの)。
  計画: docs/planning/admin-growth-overview-p1-p2-implementation-plan.md

  ## 1. サブスクの付与に「本番」の印が無い経路がある

  プラン変更(features/subscription/lib/change-service.ts の grant_subscription_percoins)と、
  年額プランの毎月の付与(20260331193000 の cron)は、metadata に mode を書かない。
  mode = 'live' だけで数えると、本当の支払いが「使っている人」と「買った量」から落ちる。
  サブスクは「test・mock 以外」を本番として数える(purchase は今までどおり live だけ)。
  2026-10-26 時点で mode の無いサブスクの行は、4月に内部アカウントが試した6件だけ。

  ## 2. 期間の終わりが未来だと、残りの日数が長く出る

  1日あたりの消費を「期間の長さ」で割っていたので、終わりが未来だと
  まだ来ていない日まで分母に入る。least(p_end, now()) までの長さで割る。

  引数と戻り値は変えない(CREATE OR REPLACE のまま。権限は引き継がれるが、念のため付け直す)。
*/

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
    WHERE (
        (t.transaction_type = 'purchase' AND t.metadata->>'mode' = 'live')
        -- サブスクは mode を書かない経路がある(プラン変更・年額の毎月付与)。
        -- テスト・見本の印があるものだけを外す
        OR (t.transaction_type = 'subscription'
            AND coalesce(t.metadata->>'mode', 'live') NOT IN ('test', 'mock'))
      )
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
  WHERE NOT (a.user_id = ANY (array_remove(coalesce(p_exclude_user_ids, '{}'), NULL)));
$function$;

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
      AND NOT (tx.user_id = ANY (array_remove(coalesce(p_exclude_user_ids, '{}'), NULL)))
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
      WHERE t.amount > 0
        AND (
          (t.transaction_type = 'purchase' AND t.metadata->>'mode' = 'live')
          OR (t.transaction_type = 'subscription'
              AND coalesce(t.metadata->>'mode', 'live') NOT IN ('test', 'mock'))
        )
    ), 0)::bigint AS purchased
  FROM days
  LEFT JOIN t ON t.day = days.day
  GROUP BY days.day
  ORDER BY days.day;
$function$;

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
      AND NOT (tx.user_id = ANY (array_remove(coalesce(p_exclude_user_ids, '{}'), NULL)))
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
          / greatest(extract(epoch FROM (least(p_end, now()) - p_start)) / 86400.0, 1.0 / 24.0)
        )
    END AS days_left
  FROM per
  LEFT JOIN public.user_credits c ON c.user_id = per.user_id;
$function$;

REVOKE ALL ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_growth_active_users(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_daily_flow(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.growth_percoin_consumers(timestamptz, timestamptz, uuid[]) FROM service_role;

COMMIT;

-- ===============================================
-- DOWN: 20261025233400 の3つの関数の定義に戻す(CREATE OR REPLACE で上書き)
-- ===============================================
