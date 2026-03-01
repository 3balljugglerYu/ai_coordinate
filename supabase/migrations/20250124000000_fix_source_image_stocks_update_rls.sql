-- ===============================================
-- Fix source_image_stocks UPDATE RLS Policy (Final)
-- source_image_stocksテーブルのUPDATE RLSポリシーを最終修正
-- 通常の更新と論理削除の両方に対応する単一のポリシーに統合
-- ===============================================

-- 既存のUPDATEポリシーを削除
DROP POLICY IF EXISTS "Allow users to update their own source_image_stocks" ON public.source_image_stocks;
DROP POLICY IF EXISTS "Allow users to delete their own source_image_stocks" ON public.source_image_stocks;

-- 単一のUPDATEポリシーを作成（通常の更新と論理削除の両方に対応）
-- USING句: 更新前の行がuser_idと一致し、deleted_atがNULLであることを確認
-- WITH CHECK句: 更新後の行がuser_idと一致することを確認（deleted_atはNULLでも非NULLでも許可）
CREATE POLICY "Allow users to update their own source_image_stocks"
  ON public.source_image_stocks
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);
