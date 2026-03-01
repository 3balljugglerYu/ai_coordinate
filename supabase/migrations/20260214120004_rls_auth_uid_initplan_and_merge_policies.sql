-- ===============================================
-- RLS auth.uid() initplan and merge permissive policies
-- アドバイザー「Auth RLS Initialization Plan」「Multiple Permissive Policies」の解消
-- ===============================================

-- likes
DROP POLICY IF EXISTS "Allow authenticated users to insert likes" ON public.likes;
CREATE POLICY "Allow authenticated users to insert likes"
  ON public.likes
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own likes" ON public.likes;
CREATE POLICY "Allow users to delete their own likes"
  ON public.likes
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- comments: merge SELECT policies, fix auth.uid()
DROP POLICY IF EXISTS "Allow public read access on non-deleted comments" ON public.comments;
DROP POLICY IF EXISTS "Allow users to read their own comments" ON public.comments;
CREATE POLICY "Allow read comments public or own"
  ON public.comments
  FOR SELECT
  USING (deleted_at IS NULL OR (select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow authenticated users to insert comments" ON public.comments;
CREATE POLICY "Allow authenticated users to insert comments"
  ON public.comments
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow users to modify their own comments" ON public.comments;
CREATE POLICY "Allow users to modify their own comments"
  ON public.comments
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own comments" ON public.comments;
CREATE POLICY "Allow users to delete their own comments"
  ON public.comments
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- profiles
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.profiles;
CREATE POLICY "Allow users to insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
CREATE POLICY "Allow users to update their own profile"
  ON public.profiles
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- source_image_stocks
DROP POLICY IF EXISTS "Allow users to read their own source_image_stocks" ON public.source_image_stocks;
CREATE POLICY "Allow users to read their own source_image_stocks"
  ON public.source_image_stocks
  FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow authenticated users to insert their own source_image_stoc" ON public.source_image_stocks;
CREATE POLICY "Allow authenticated users to insert their own source_image_stocks"
  ON public.source_image_stocks
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow users to update their own source_image_stocks" ON public.source_image_stocks;
CREATE POLICY "Allow users to update their own source_image_stocks"
  ON public.source_image_stocks
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own source_image_stocks" ON public.source_image_stocks;
CREATE POLICY "Allow users to delete their own source_image_stocks"
  ON public.source_image_stocks
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- image_jobs
DROP POLICY IF EXISTS "Users can view their own image_jobs" ON public.image_jobs;
CREATE POLICY "Users can view their own image_jobs"
  ON public.image_jobs
  FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own image_jobs" ON public.image_jobs;
CREATE POLICY "Users can insert their own image_jobs"
  ON public.image_jobs
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own image_jobs" ON public.image_jobs;
CREATE POLICY "Users can update their own image_jobs"
  ON public.image_jobs
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own image_jobs" ON public.image_jobs;
CREATE POLICY "Users can delete their own image_jobs"
  ON public.image_jobs
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- notifications: merge UPDATE policies (service_role OR recipient)
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can update push status" ON public.notifications;
CREATE POLICY "Users or service role can update notifications"
  ON public.notifications
  FOR UPDATE
  USING (
    ((select auth.jwt()) ->> 'role') = 'service_role'
    OR (select auth.uid()) = recipient_id
  )
  WITH CHECK (
    ((select auth.jwt()) ->> 'role') = 'service_role'
    OR (select auth.uid()) = recipient_id
  );
