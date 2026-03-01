-- ===============================================
-- Relax source_image_stocks SELECT RLS Policy
-- UPDATE後のRETURNINGでdeleted行も返せるようにする
-- ※ UI側ではクエリでdeleted_at IS NULLを明示的にフィルタする方針
-- ===============================================

-- 既存のSELECTポリシーを削除
DROP POLICY IF EXISTS "Allow users to read their own source_image_stocks"
  ON public.source_image_stocks;

-- 読み取りポリシーを緩和
-- USING句: ユーザー本人のレコードであればdeleted_atの状態に関わらずSELECT可能
-- （UIでは .is(\"deleted_at\", null) などで非削除のみを表示する）
CREATE POLICY "Allow users to read their own source_image_stocks"
  ON public.source_image_stocks
  FOR SELECT
  USING (auth.uid() = user_id);


