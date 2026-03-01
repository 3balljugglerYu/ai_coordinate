-- ===========================================
-- RLSポリシーの完全リセットと開発用ポリシーの設定
-- ===========================================

-- generated_imagesテーブルの既存ポリシーをすべて削除
DROP POLICY IF EXISTS "Users can view their own images" ON public.generated_images;
DROP POLICY IF EXISTS "Posted images are viewable by everyone" ON public.generated_images;
DROP POLICY IF EXISTS "Users can insert their own images" ON public.generated_images;
DROP POLICY IF EXISTS "Users can update their own images" ON public.generated_images;
DROP POLICY IF EXISTS "Users can delete their own images" ON public.generated_images;
DROP POLICY IF EXISTS "Dev: Allow inserts to generated_images" ON public.generated_images;
DROP POLICY IF EXISTS "Dev: Allow all operations" ON public.generated_images;

-- 開発用ポリシー: すべての操作を許可（認証不要）
CREATE POLICY "Dev: Allow all operations"
  ON public.generated_images
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 確認: 現在のポリシーを表示
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'generated_images';

