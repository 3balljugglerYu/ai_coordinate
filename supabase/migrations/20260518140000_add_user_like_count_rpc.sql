-- ===============================================
-- Add get_user_like_count RPC
-- マイページの累計いいね数を Postgres 側で集計するための関数
--
-- 既存実装は generated_images から投稿済み画像 ID を全件取得してから
-- likes を WHERE image_id IN (...) で集計していたが、PostgREST のデフォルト
-- 返却上限（1000 行）により投稿数が 1000 を超えると ID 配列が打ち切られ、
-- 一部の投稿に対するいいねが likeCount に含まれない問題があった。
--
-- 20260518130000_add_my_page_stats_rpcs と同じ方針で集計を Postgres 側に寄せる。
-- ===============================================

create or replace function public.get_user_like_count(p_user_id uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::bigint
  from public.likes as l
  join public.generated_images as gi on gi.id = l.image_id
  where gi.user_id = p_user_id
    and gi.is_posted = true;
$$;

comment on function public.get_user_like_count(uuid) is
  '指定ユーザーの累計いいね数（投稿済み generated_images に紐づく likes の件数）を返す。';

revoke all on function public.get_user_like_count(uuid) from public;
grant execute on function public.get_user_like_count(uuid) to authenticated;
