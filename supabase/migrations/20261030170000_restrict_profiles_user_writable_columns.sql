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
--   - avatar_url: Web のアイコンの変更(app/api/users/[userId]/avatar/route.ts)
--   - signup_source: アプリの OAuth の登録(auth_repository.dart の backfillSignupSource)。
--     20261030160000 のトリガーが user_signup_sources に移して列は空のままにする。アプリを直したら外す
--   ほかの列は、SECURITY DEFINER の関数(grant_daily_post_bonus・grant_streak_bonus・request_account_deletion・
--   sync_profile_subscription_plan など)か、service_role の接続から書いている。この変更の影響を受けない。
--   新しい行は handle_new_user(SECURITY DEFINER)が作るので、利用者の INSERT も外す。
--
--   ## やること
--   anon・authenticated から表ごとの INSERT・UPDATE を外し、authenticated に上の4列の UPDATE だけを付ける。
--   RLS の決まり(本人の行だけ)はそのまま。読み込み(SELECT)は変えない。

BEGIN;

SET LOCAL lock_timeout = '5s';

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (nickname, bio, avatar_url, signup_source) ON TABLE public.profiles TO authenticated;

COMMENT ON TABLE public.profiles IS
  'プロフィール。だれでも全部の列を読める(公開の SELECT)。利用者が書き換えられるのは nickname・bio・avatar_url・signup_source だけ(20261030170000)。ほかの列はサーバーの関数か service_role から書く';

COMMIT;

NOTIFY pgrst, 'reload schema';
