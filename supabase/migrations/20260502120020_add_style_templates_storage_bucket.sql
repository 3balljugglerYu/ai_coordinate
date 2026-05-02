-- ===============================================
-- Style Templates Storage Bucket (private)
-- ===============================================
-- ADR-009 参照
-- 本リポジトリ初の private バケット。
--
-- パス構造:
--   style-templates/system/test-character.png         — 運営テストキャラ画像（service-role 経由でのみ書き込み可）
--   style-templates/{user_id}/{uuid}.{ext}             — 申請者がアップロードしたテンプレ画像
--   style-templates/{user_id}/preview/{uuid}-{provider}.{ext} — プレビュー画像
--
-- アクセス: SELECT は API 経由の signed URL のみ（Storage 直 SELECT は許可しない）

-- ===============================================
-- 1. バケット作成（private）
-- ===============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'style-templates',
  'style-templates',
  false,                                                          -- private
  10485760,                                                       -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ===============================================
-- 2. Storage RLS ポリシー
-- ===============================================
-- INSERT: 自分の auth.uid() フォルダ配下のみ書き込み可
--         system/ への書き込みは service-role 経由のみ（authenticated は弾かれる）

DROP POLICY IF EXISTS "style_templates_upload_own_folder" ON storage.objects;
CREATE POLICY "style_templates_upload_own_folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'style-templates'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- DELETE: 自分の auth.uid() フォルダ配下のみ削除可（draft 取り下げ時の自己削除）
DROP POLICY IF EXISTS "style_templates_delete_own_folder" ON storage.objects;
CREATE POLICY "style_templates_delete_own_folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'style-templates'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- SELECT ポリシーは作らない:
--   閲覧は API ルートで service-role を使った signed URL 発行のみ。
--   anon / authenticated の直接 SELECT は RLS のデフォルトで拒否される。

-- ===============================================
-- DOWN:
-- DROP POLICY IF EXISTS "style_templates_delete_own_folder" ON storage.objects;
-- DROP POLICY IF EXISTS "style_templates_upload_own_folder" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'style-templates';
-- ===============================================
