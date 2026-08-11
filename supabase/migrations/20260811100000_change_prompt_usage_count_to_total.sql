-- プロンプトの公開利用数を「ユニーク利用者数」から「累計利用回数」に変更する
-- (計画書: docs/planning/home-feed-view-implementation-plan.md)
--
-- 理由は2つ。
--
-- 1) 通知と食い違っていた。マイルストーン通知 (notify_on_prompt_usage_milestone) は
--    もともと count(*) の累計回数で節目を判定している。表示だけが人数だったため、
--    原作者が「10回使われました」の通知を受け取ったのにカードは「3人が使いました」に
--    なる、という状態が起き得た。
--
-- 2) 人数は伸びが遅く、初期の原作者にとって「使われていない」ように見える。
--    公開する数字は伸びやすい累計回数にし、さらに UI 側で一定回数に届くまでは
--    表示しない(少ない数字を出すと、かえって投稿の意欲を削ぐため)。
--
-- 原作者自身の生成を除外する規則は変えない。

CREATE OR REPLACE FUNCTION public.get_prompt_usage_count(
  p_origin_post_id uuid
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT count(*)::integer
  FROM public.prompt_usage_events AS e
  WHERE e.origin_post_id = p_origin_post_id
    -- 原作者自身の生成は数えない(マイルストーン通知と同じ除外規則)
    AND e.user_id <> e.origin_author_id;
$function$;

COMMENT ON FUNCTION public.get_prompt_usage_count(uuid) IS
  '原作の累計利用回数。原作者自身は除外。マイルストーン通知と同じ数え方。service-only（任意UUIDでの列挙を防ぐ）';

-- CREATE OR REPLACE は既存の権限を保つが、意図を明示するため再適用する
REVOKE ALL ON FUNCTION public.get_prompt_usage_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_prompt_usage_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_prompt_usage_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_prompt_usage_count(uuid) TO service_role;

-- 関数を差し替えたので Data API のキャッシュを再読み込みさせる
NOTIFY pgrst, 'reload schema';
