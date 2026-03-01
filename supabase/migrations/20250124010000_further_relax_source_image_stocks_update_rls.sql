-- ===============================================
-- Further Relax source_image_stocks UPDATE RLS Policy
-- source_image_stocksテーブルのUPDATE RLSポリシーをさらに緩和
-- WITH CHECK句をtrueにして、更新後の行について追加条件を設けない
-- ===============================================

-- 既存のUPDATEポリシーを削除
DROP POLICY IF EXISTS "Allow users to update their own source_image_stocks" ON public.source_image_stocks;

-- 緩和されたUPDATEポリシーを作成
-- USING句: 更新前の行が自分のレコードであることを確認（deleted_atの状態に関係なく）
-- WITH CHECK句: 常にTRUE（更新後の行については追加条件なし）
CREATE POLICY "Allow users to update their own source_image_stocks"
  ON public.source_image_stocks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (true);

