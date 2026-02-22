-- Fix: Multiple Permissive Policies (Lint 0006)
-- 2つの SELECT ポリシーを1つに統合し、moderation_status を RLS に含める（多層防御）
-- 参照: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0006_multiple_permissive_policies

DROP POLICY IF EXISTS "Posted images are viewable by everyone" ON public.generated_images;
DROP POLICY IF EXISTS "Users can view their own images" ON public.generated_images;

CREATE POLICY "View posted or own images"
ON public.generated_images
FOR SELECT
TO PUBLIC
USING (
  (is_posted = true AND moderation_status = 'visible') OR (user_id = auth.uid())
);
