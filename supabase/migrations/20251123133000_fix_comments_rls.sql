-- ===============================================
-- Comments RLS policy adjustments
-- ・更新/削除を1本のUPDATEポリシーで制御
-- ・本人はdeleted_at後でもSELECTできるようにする
-- ===============================================

-- UPDATE系ポリシーを整理
DROP POLICY IF EXISTS "Allow users to update their own comments" ON public.comments;
DROP POLICY IF EXISTS "Allow users to delete their own comments" ON public.comments;

CREATE POLICY "Allow users to modify their own comments"
  ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- SELECTポリシーを追加（本人は常にアクセス可能）
DROP POLICY IF EXISTS "Allow users to read their own comments" ON public.comments;

CREATE POLICY "Allow users to read their own comments"
  ON public.comments
  FOR SELECT
  USING (auth.uid() = user_id);

