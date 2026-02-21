-- Fix: Auth RLS Initialization Plan (Lint 0003)
-- auth.uid() を (select auth.uid()) に変更し、クエリごとに1回だけ評価されるようにする
-- 参照: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0003_auth_rls_initplan
-- 参照: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

DROP POLICY IF EXISTS "View posted or own images" ON public.generated_images;

CREATE POLICY "View posted or own images"
ON public.generated_images
FOR SELECT
TO PUBLIC
USING (
  (is_posted = true AND moderation_status = 'visible') OR (user_id = (select auth.uid()))
);
