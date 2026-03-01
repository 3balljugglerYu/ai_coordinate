-- ===============================================
-- Development Storage Policy
-- 開発用：認証なしでもStorageアップロードを許可
-- Phase 2で認証機能実装後に削除すること
-- ===============================================

-- 既存のポリシーを削除（もし存在すれば）
DROP POLICY IF EXISTS "Users can upload images to their own folder" ON storage.objects;

-- 開発用ポリシー: 認証なしでもアップロード可能（一時的）
CREATE POLICY "Dev: Allow uploads to generated-images bucket"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'generated-images');

-- 注意: このポリシーはPhase 2（認証機能実装後）に以下のポリシーに置き換えること
-- CREATE POLICY "Users can upload images to their own folder"
--   ON storage.objects
--   FOR INSERT
--   WITH CHECK (
--     bucket_id = 'generated-images' 
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );

