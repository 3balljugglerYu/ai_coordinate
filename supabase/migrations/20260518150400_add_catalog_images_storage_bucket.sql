-- ===============================================
-- Catalog Images Storage Bucket (private)
-- ===============================================
-- 投稿画像 (catalog_entries.image_storage_path) と
-- 企画表紙 (catalog_campaigns.cover_storage_path) を保存する private バケット。
-- 公開閲覧時は API 経由で署名 URL を発行する。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-images',
  'catalog-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 注: ADR-007 / ADR-008 に従い、アップロードは投稿 API (service_role) のみが行う。
-- そのため anon と authenticated には INSERT / UPDATE / DELETE の policy を付けない。
-- service_role は RLS を bypass するため、policy なしでもバケットへの書き込みが可能。

-- ===============================================
-- DOWN:
-- DELETE FROM storage.buckets WHERE id = 'catalog-images';
-- ===============================================
