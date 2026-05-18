-- ===============================================
-- Add my page stats RPCs
-- マイページの累計生成数・累計ビュー数を Postgres 側で集計するための関数
--
-- PostgREST のデフォルト返却上限（1000 行）により、ヘビーユーザーで
-- 累計値が頭打ちになる既知の問題（image_jobs/view_count 行 > 1000）に対処する。
-- ===============================================

-- 累計生成数: 成功した image_jobs.requested_image_count の合計
-- requested_image_count が NULL の旧ジョブも最低 1 枚として加算する
create or replace function public.get_user_generated_count(p_user_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(coalesce(requested_image_count, 1)), 0)::bigint
  from public.image_jobs
  where user_id = p_user_id
    and status = 'succeeded';
$$;

comment on function public.get_user_generated_count(uuid) is
  '指定ユーザーの累計生成数（成功 image_jobs の requested_image_count 合計）を返す。NULL の行は 1 として加算。';

-- 累計ビュー数: 投稿済み generated_images.view_count の合計
create or replace function public.get_user_view_count(p_user_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(view_count), 0)::bigint
  from public.generated_images
  where user_id = p_user_id
    and is_posted = true;
$$;

comment on function public.get_user_view_count(uuid) is
  '指定ユーザーの累計ビュー数（投稿済み generated_images.view_count の合計）を返す。';

-- 権限: 認証済みユーザーのみ実行可能
revoke all on function public.get_user_generated_count(uuid) from public;
grant execute on function public.get_user_generated_count(uuid) to authenticated;

revoke all on function public.get_user_view_count(uuid) from public;
grant execute on function public.get_user_view_count(uuid) to authenticated;
