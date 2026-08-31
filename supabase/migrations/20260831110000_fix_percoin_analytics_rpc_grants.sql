BEGIN;

/*
  ペルコイン分析 RPC が anon / authenticated から実行できてしまっていたのを塞ぐ。

  ⚠️ **新規関数の EXECUTE は PUBLIC 既定付与に加え、Supabase の既定権限で
  anon と authenticated にも直接 GRANT される。**
  そのため `REVOKE ... FROM PUBLIC` だけでは閉じない。

  20260831100000 で PUBLIC からしか REVOKE しておらず、適用後の実 ACL は
    {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
  となっていた（正しく閉じている search_hashtags は {postgres=X,service_role=X}）。

  これらは admin 集計用で、配布総額・保有分布・継続率といった運営指標を返す。
  個人を特定する値は含まないが、未ログインからも引ける状態は意図していない。
*/

REVOKE ALL ON FUNCTION public.get_percoin_grant_breakdown(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_grant_breakdown(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_grant_breakdown(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_grant_breakdown(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_streak_reach(timestamptz, timestamptz, integer, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_streak_reach(timestamptz, timestamptz, integer, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_streak_reach(timestamptz, timestamptz, integer, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_streak_reach(timestamptz, timestamptz, integer, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_checkin_reach(timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_checkin_reach(timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_checkin_reach(timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_checkin_reach(timestamptz, timestamptz, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_balance_distribution(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_balance_distribution(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_balance_distribution(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_balance_distribution(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
