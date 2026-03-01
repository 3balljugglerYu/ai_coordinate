-- ===============================================
-- Development Table Policy
-- 開発用：認証なしでもテーブルへのINSERTを許可
-- Phase 2で認証機能実装後に削除すること
-- ===============================================

-- 既存のポリシーを削除（もし存在すれば）
DROP POLICY IF EXISTS "Users can insert their own images" ON public.generated_images;

-- 開発用ポリシー: 認証なしでもINSERT可能（一時的）
CREATE POLICY "Dev: Allow inserts to generated_images"
  ON public.generated_images
  FOR INSERT
  WITH CHECK (true);

-- 注意: このポリシーはPhase 2（認証機能実装後）に以下のポリシーに置き換えること
-- CREATE POLICY "Users can insert their own images"
--   ON public.generated_images
--   FOR INSERT
--   WITH CHECK (auth.uid() = user_id);

