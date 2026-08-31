BEGIN;

/*
  ペルコインの配布状況を admin ダッシュボードで見るための集計 RPC。

  ## なぜ SQL 側で集計するか

  credit_transactions は 2026-08-31 時点で 9,154行あり、増え続ける。
  行を引いてアプリ側で集計すると PostgREST の 1,000行上限に当たり、
  **エラーも出さずに数字が過小になる**（#579 / #580 で実際に起きた事故）。
  集計を DB に置けば行数上限とは無関係になる。

  ## 運営・テストアカウントの除外

  どの関数も p_exclude_user_ids で除外する。呼び出し側は
  getOperatorUserIds() の結果を渡すこと。内部アカウントを含めると
  分布が大きく歪む（ペルコイン保有では2件で全体の36%を占めていた）。
*/

-- 付与元ごとの配布内訳。
-- source は metadata->>'bonus_source' を優先する。投稿ボーナスは
-- 生成方法ごとに額が違うため(daily_post_one_tap / daily_post_free)、
-- transaction_type だけでは「どの生成方法に配っているか」が潰れる。
-- bonus_source が無い古い行は transaction_type のまま出る(= 'daily_post')。
CREATE OR REPLACE FUNCTION public.get_percoin_grant_breakdown(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  source text,
  grant_count bigint,
  total_amount bigint,
  user_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    coalesce(t.metadata->>'bonus_source', t.transaction_type) AS source,
    count(*) AS grant_count,
    sum(t.amount)::bigint AS total_amount,
    count(DISTINCT t.user_id) AS user_count
  FROM public.credit_transactions t
  WHERE t.amount > 0
    AND t.created_at >= p_start
    AND t.created_at < p_end
    AND t.user_id IS NOT NULL
    AND NOT (t.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
  GROUP BY 1
  ORDER BY total_amount DESC;
$function$;

-- 連続ログインの日別到達人数。
-- streak_days は付与時の metadata に入る。1日目を分母にして
-- 「どこで離脱しているか」を見る(実測では1日目→2日目で最も落ちる)。
CREATE OR REPLACE FUNCTION public.get_percoin_streak_reach(
  p_start timestamptz,
  p_end timestamptz,
  p_max_day integer DEFAULT 14,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  streak_day integer,
  user_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    d.day AS streak_day,
    count(DISTINCT t.user_id) AS user_count
  FROM generate_series(1, greatest(p_max_day, 1)) AS d(day)
  LEFT JOIN public.credit_transactions t
    ON t.transaction_type = 'streak'
   AND t.created_at >= p_start
   AND t.created_at < p_end
   AND t.user_id IS NOT NULL
   AND NOT (t.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
   -- 数値以外が入っていても落ちないようにガードする
   AND t.metadata->>'streak_days' ~ '^[0-9]+$'
   AND (t.metadata->>'streak_days')::int = d.day
  GROUP BY d.day
  ORDER BY d.day;
$function$;

-- 期間内に登録した人のうち、チェックインを1度でも押した割合。
-- チェックインの実体は streak 付与なので、streak 取引の有無で判定する。
-- 「押さなかった人」は導線に気づいていない可能性が高く、額を下げる前に
-- 見るべき数字(実測で新規の約3割が一度も押していなかった)。
CREATE OR REPLACE FUNCTION public.get_percoin_checkin_reach(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  signup_count bigint,
  checked_in_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH signups AS (
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.created_at >= p_start
      AND p.created_at < p_end
      AND p.user_id IS NOT NULL
      AND NOT (p.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
  )
  SELECT
    count(*) AS signup_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.credit_transactions t
        WHERE t.user_id = s.user_id
          AND t.transaction_type = 'streak'
      )
    ) AS checked_in_count
  FROM signups s;
$function$;

-- 保有ペルコインの分布。
-- 個人名の一覧は /admin/credits-summary にあるので、ここでは分布だけを見る。
-- 「誰が持っているか」より「どう散らばっているか」の方が額の判断に効く。
CREATE OR REPLACE FUNCTION public.get_percoin_balance_distribution(
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  holder_count bigint,
  total_balance bigint,
  median_balance numeric,
  p90_balance numeric,
  top10_percent_share numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH holders AS (
    SELECT c.balance::numeric AS balance
    FROM public.user_credits c
    WHERE c.user_id IS NOT NULL
      AND NOT (c.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
      AND c.balance > 0
  ),
  ranked AS (
    SELECT
      balance,
      -- 上位10%を切り出す。端数は切り上げて必ず1人以上含める
      row_number() OVER (ORDER BY balance DESC) AS rank,
      count(*) OVER () AS total_count
    FROM holders
  )
  SELECT
    (SELECT count(*) FROM holders) AS holder_count,
    coalesce((SELECT sum(balance) FROM holders), 0)::bigint AS total_balance,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY balance) FROM holders) AS median_balance,
    (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY balance) FROM holders) AS p90_balance,
    CASE
      WHEN (SELECT sum(balance) FROM holders) > 0 THEN
        round(
          (SELECT sum(balance) FROM ranked WHERE rank <= ceil(total_count * 0.1))
          / (SELECT sum(balance) FROM holders) * 100,
          1
        )
      ELSE 0
    END AS top10_percent_share;
$function$;

/*
  admin 専用の集計。service_role からのみ呼ぶ。
  SECURITY DEFINER なので、既定の PUBLIC 実行権限を必ず落とすこと
  (残すと誰でも他人の保有額の分布を引けてしまう)。
*/
REVOKE ALL ON FUNCTION public.get_percoin_grant_breakdown(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_streak_reach(timestamptz, timestamptz, integer, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_checkin_reach(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_balance_distribution(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_percoin_grant_breakdown(timestamptz, timestamptz, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_percoin_streak_reach(timestamptz, timestamptz, integer, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_percoin_checkin_reach(timestamptz, timestamptz, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_percoin_balance_distribution(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
