-- お知らせ 1 ページ分を、表示に要る情報ごと 1 回で返す。
--
-- これまで Web(enrichNotificationsWithDetails)とアプリは、一覧 → 相手の
-- プロフィール → コメントの投稿 → 投稿のサムネイルを順に取っていた(往復 3〜4 回)。
-- actor_id は auth.users を、entity_id は投稿かコメントを指すため、
-- PostgREST の埋め込みでは 1 回にまとめられない。
--
-- 返すのは結合した生の値だけ。次の判断は呼び出し側に残す(Web とアプリで共通の規則):
--   - 匿名通知(運営の措置・利用数の節目・還元)では actor を使わない
--   - 重大な安全カテゴリの措置通知ではサムネイルを出さない
--   - サムネイル URL の組み立て(storage_path_thumb → storage_path → image_url)
--
-- SECURITY INVOKER: 各表の RLS がそのまま効く(これまでの取得と同じ見え方)。
-- Web の「use cache」はサービスロールで呼ぶため p_user_id を受け取るが、
-- ログイン中の利用者からは自分の分しか取れない。

create or replace function public.get_notifications_page(
  p_user_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_notification_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with page as (
    select n.*
    from public.notifications n
    where n.recipient_id = p_user_id
      and (
        p_user_id = (select auth.uid())
        or (select auth.role()) = 'service_role'
      )
      and (p_notification_id is null or n.id = p_notification_id)
      and (
        p_cursor_created_at is null
        or p_cursor_id is null
        or n.created_at < p_cursor_created_at
        or (n.created_at = p_cursor_created_at and n.id < p_cursor_id)
      )
    order by n.created_at desc, n.id desc
    -- 次のページの有無を呼び出し側が判断できるよう 1 件多く返す
    limit least(greatest(coalesce(p_limit, 20), 1), 100) + 1
  ),
  resolved as (
    select
      p.*,
      case
        when p.entity_type = 'post' then p.entity_id
        when p.entity_type = 'comment' then coalesce(
          case
            when jsonb_typeof(p.data -> 'image_id') = 'string'
              and p.data ->> 'image_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (p.data ->> 'image_id')::uuid
          end,
          (select c.image_id from public.comments c where c.id = p.entity_id)
        )
      end as resolved_image_id
    from page p
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(r) - 'resolved_image_id'
        || jsonb_build_object(
          'resolved_image_id', r.resolved_image_id,
          'actor', (
            select jsonb_build_object(
              'user_id', pr.user_id,
              'nickname', pr.nickname,
              'avatar_url', pr.avatar_url
            )
            from public.profiles pr
            where pr.user_id = r.actor_id
          ),
          'post', (
            select jsonb_build_object(
              'id', g.id,
              'image_url', g.image_url,
              'storage_path', g.storage_path,
              'storage_path_thumb', g.storage_path_thumb,
              'caption', g.caption
            )
            from public.generated_images g
            where g.id = r.resolved_image_id
          )
        )
      order by r.created_at desc, r.id desc
    ),
    '[]'::jsonb
  )
  from resolved r;
$$;

comment on function public.get_notifications_page(uuid, integer, timestamptz, uuid, uuid) is
  'お知らせ 1 ページ分(limit+1 件)を、相手のプロフィールと投稿のサムネイル情報つきで返す。匿名通知の actor 除外・サムネイル非表示・URL 組み立ては呼び出し側。';

-- public スキーマの関数は anon にも自動で EXECUTE が付くため閉じる(#582)。
revoke execute on function public.get_notifications_page(uuid, integer, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.get_notifications_page(uuid, integer, timestamptz, uuid, uuid) to authenticated, service_role;
