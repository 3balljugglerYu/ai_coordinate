-- ===============================================
-- Style Templates Storage Bucket (private)
-- ===============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'style-templates',
  'style-templates',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "style_templates_upload_own_folder" ON storage.objects;
CREATE POLICY "style_templates_upload_own_folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'style-templates'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "style_templates_delete_own_folder" ON storage.objects;
CREATE POLICY "style_templates_delete_own_folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'style-templates'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
