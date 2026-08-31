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

-- 連続ログインのコホート到達率。
--
-- ⭐ 単に「期間内に streak_days=N が発生した人数」を数えると**コホートに
-- ならない**。既存の長期ユーザーが混ざるため、実測で 7日窓の day10(9人) が
-- day5(3人) を上回るなど単調に減らず、「1日目→2日目で何%離脱」という
-- 読み方ができない（レビュー指摘）。
--
-- そこで「期間内に1日目を迎えた人」をコホートとして固定し、その人たちが
-- どこまで伸ばせたかを追う。
--
-- 母数は day1 の人数ではなく **eligible_count**（その日数に到達しうるだけの
-- 日が経っている人）にする。開始から2日しか経っていない人を14日目の母数に
-- 入れると、続けているのに脱落したように見えてしまう。
CREATE OR REPLACE FUNCTION public.get_percoin_streak_reach(
  p_start timestamptz,
  p_end timestamptz,
  p_max_day integer DEFAULT 14,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  streak_day integer,
  user_count bigint,
  eligible_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH cohort AS (
    SELECT t.user_id, min(t.created_at) AS started_at
    FROM public.credit_transactions t
    WHERE t.transaction_type = 'streak'
      AND t.created_at >= p_start
      AND t.created_at < p_end
      AND t.metadata->>'streak_days' = '1'
      AND t.user_id IS NOT NULL
      AND NOT (t.user_id = ANY (coalesce(p_exclude_user_ids, '{}')))
    GROUP BY t.user_id
  ),
  reached AS (
    SELECT
      c.user_id,
      c.started_at,
      -- 開始以降に記録された最大の連続日数。1日目しか無ければ 1
      coalesce(max((t.metadata->>'streak_days')::int), 1) AS max_day
    FROM cohort c
    LEFT JOIN public.credit_transactions t
      ON t.user_id = c.user_id
     AND t.transaction_type = 'streak'
     AND t.created_at >= c.started_at
     AND t.created_at < p_end
     -- 数値以外が入っていても落ちないようにガードする
     AND t.metadata->>'streak_days' ~ '^[0-9]+$'
    GROUP BY c.user_id, c.started_at
  ),
  matured AS (
    /*
      ⭐ 経過は「24時間 × N」ではなく **JST の暦日**で数える。
      grant_streak_bonus が (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE で
      継続を判定しているため、23:50 に1日目・翌 00:10 に2日目を押せる。
      24時間換算で母数を作ると、2日目に到達済みなのに「まだ到達しえない」と
      判定されて **分子が分母を超える**（実際に到達1/母数0 が起きうる）。
    */
    SELECT
      r.max_day,
      (p_end AT TIME ZONE 'Asia/Tokyo')::date
        - (r.started_at AT TIME ZONE 'Asia/Tokyo')::date AS elapsed_days
    FROM reached r
  )
  SELECT
    d.day AS streak_day,
    -- 分子にも母数と同じ条件を掛ける（掛けないと比率が100%を超えうる）
    count(*) FILTER (
      WHERE m.elapsed_days >= d.day - 1 AND m.max_day >= d.day
    ) AS user_count,
    count(*) FILTER (WHERE m.elapsed_days >= d.day - 1) AS eligible_count
  FROM generate_series(1, greatest(p_max_day, 1)) AS d(day)
  CROSS JOIN matured m
  GROUP BY d.day
  ORDER BY d.day;
$function$;

-- 期間内に登録した人のうち、その期間の終了時点でチェックインを押していた割合。
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
          /*
            ⭐ 期間で絞らないと、前期に登録した人が当期以降に初めて押したぶんが
            **後から前期の実績に加算される**。前期ほど観測期間が長くなり、
            当期 vs 前期の比較が成立しなくなる。各期間を「その期間の終了時点で
            押していたか」で評価する（登録は期間内なので下限の指定は不要）。
          */
          AND t.created_at < p_end
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
