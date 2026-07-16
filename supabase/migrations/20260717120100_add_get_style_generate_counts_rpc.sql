-- /style「👑人気」チップ用: プリセット別の直近生成数を DB 側 GROUP BY で返す RPC。
--
-- style_usage_events は RLS 全拒否(クライアント直読不可)のため、SECURITY DEFINER で
-- 集計だけを公開する…のではなく、EXECUTE も service_role に限定し、サーバー側
-- (features/style/lib/style-popularity.ts の admin client + "use cache")からのみ呼ぶ。
-- これにより RLS 全拒否の迂回路を作らない。
-- 集計を DB に寄せる理由: PostgREST の行上限(1000)に依存せず、転送も最小になるため
-- (get_generated_preset_ids / count_distinct_styles_by_category と同方針)。
CREATE OR REPLACE FUNCTION public.get_style_generate_counts(
  p_days INT
)
RETURNS TABLE (style_id TEXT, generate_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.style_id, COUNT(*)::BIGINT AS generate_count
  FROM public.style_usage_events e
  WHERE e.event_type = 'generate'
    AND e.style_id IS NOT NULL
    AND e.created_at > now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
  GROUP BY e.style_id;
$$;

-- RLS全拒否テーブルの集計なので、EXECUTE は service_role のみ(anon/authenticated不可)。
REVOKE ALL ON FUNCTION public.get_style_generate_counts(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_style_generate_counts(INT) FROM anon;
REVOKE ALL ON FUNCTION public.get_style_generate_counts(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_style_generate_counts(INT) TO service_role;

COMMENT ON FUNCTION public.get_style_generate_counts(INT) IS
  'service_role専用。直近p_days日の event_type=generate をプリセット(style_id)別に集計。/style 人気チップ用';
