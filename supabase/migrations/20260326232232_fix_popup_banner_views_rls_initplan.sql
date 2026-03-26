-- Optimize popup_banner_views RLS policy to use an initplan-friendly auth.uid() lookup.

DROP POLICY IF EXISTS "popup_banner_views_select_own_policy"
  ON public.popup_banner_views;

CREATE POLICY "popup_banner_views_select_own_policy"
  ON public.popup_banner_views
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
