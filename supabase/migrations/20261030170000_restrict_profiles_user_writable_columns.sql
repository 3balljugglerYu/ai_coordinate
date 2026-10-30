-- 利用者が自分の profiles で書き換えられる列を、本人が編集してよい列だけにする
--   2026-10-30 ユーザー「A: この順で直す」
--
--   profiles には「本人の行なら UPDATE・INSERT してよい」という RLS の決まりがあり、
--   authenticated には表ごとの UPDATE・INSERT の権限が付いていた。そのため、ログインしている人は
--   自分の行のすべての列を書き換えられた。サーバーが権利の判断に使う列も含む:
--     subscription_plan(画像の生成・ボーナスの倍率)・last_daily_post_bonus_at・last_streak_login_at・
--     streak_days(ボーナス)・created_at(登録の集計)・referral_code・退会の列 など
--   (2026-10-30 の時点で、悪用された形跡は無い。サブスクの無い有料プランの一般の利用者は0人)
--
--   ## 利用者の接続で書いている列(2026-10-30 に Web とアプリのコードを調べた)
--   - nickname・bio: Web のプロフィール編集(app/api/users/[userId]/profile/route.ts)・アプリ(my_page_repository.dart)
--   - signup_source: アプリの OAuth の登録(auth_repository.dart の backfillSignupSource)。
--     20261030160000 のトリガーが user_signup_sources に移して列は空のままにする。アプリを直したら外す
--   ほかの列は、SECURITY DEFINER の関数(grant_daily_post_bonus・grant_streak_bonus・request_account_deletion・
--   sync_profile_subscription_plan など)か、service_role の接続から書いている。この変更の影響を受けない。
--   新しい行は handle_new_user(SECURITY DEFINER)が作るので、利用者の INSERT も外す。
--
--   avatar_url は利用者に書かせない。サーバーがこの値を信じて使うため(アイコンを替えるときに古いファイルを
--   消す・フォローの通知の画像)。Web のアイコンの変更(app/api/users/[userId]/avatar/route.ts)は、
--   本人を確かめたあと運営の接続で書くように変えた(アプリもこの API を通す)。
--   ⚠️ 本番に入れる順番: その API の変更を先に出してから、このマイグレーションを入れる
--   (逆だと、その間アイコンを変えられない)。
--
--   ## やること
--   anon・authenticated から表の権限をいったん全部外し、読み込み(SELECT)と、authenticated の
--   上の3列の UPDATE だけを付け直す(DELETE・TRUNCATE なども残さない)。
--   RLS の決まり(本人の行だけ)はそのまま。意味の無くなった INSERT の決まりは消す。

BEGIN;

SET LOCAL lock_timeout = '5s';

REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM authenticated;

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT UPDATE (nickname, bio, signup_source) ON TABLE public.profiles TO authenticated;

-- INSERT の権限が無いので、この決まりは何もしない。残すと「本人は足せる」と読めてしまうので消す
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.profiles;

COMMENT ON TABLE public.profiles IS
  'プロフィール。だれでも全部の列を読める(公開の SELECT)。利用者が書き換えられるのは nickname・bio・signup_source だけ(20261030170000)。ほかの列(avatar_url を含む)はサーバーの関数か service_role から書く';

COMMIT;

NOTIFY pgrst, 'reload schema';
