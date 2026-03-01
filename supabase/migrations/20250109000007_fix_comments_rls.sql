-- ===============================================
-- Fix Comments RLS Policy for UPDATE/DELETE
-- コメント更新・削除時のRLSポリシーを修正
-- ===============================================

-- 既存のUPDATEポリシーを削除
DROP POLICY IF EXISTS "Allow users to update their own comments" ON public.comments;
DROP POLICY IF EXISTS "Allow users to delete their own comments" ON public.comments;

-- 修正したポリシーを再作成
-- comments: UPDATE - 本人のみコメント編集可能
-- USING条件からdeleted_at IS NULLを削除し、user_idのみでチェック
-- WITH CHECK句を追加して、更新後の行がuser_idと一致することを確認
-- 注意: deleted_atを設定するUPDATE操作も許可される
CREATE POLICY "Allow users to update their own comments"
  ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- comments: DELETE - 本人のみコメント削除可能（論理削除）
-- USING条件からdeleted_at IS NULLを削除し、user_idのみでチェック
-- WITH CHECK句を追加して、更新後の行がuser_idと一致することを確認
-- 注意: deleted_atを設定するUPDATE操作が可能になる
CREATE POLICY "Allow users to delete their own comments"
  ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

