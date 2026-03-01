-- ===============================================
-- Initial Setup Migration
-- 画像保存機能のための基本テーブル作成
-- ===============================================

-- generated_images テーブル
-- 役割: ユーザーが生成した画像のメタデータを保存
CREATE TABLE IF NOT EXISTS public.generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  prompt TEXT NOT NULL,
  background_change BOOLEAN DEFAULT false,
  is_posted BOOLEAN DEFAULT false,
  caption TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_generated_images_user_id ON public.generated_images(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON public.generated_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_images_is_posted ON public.generated_images(is_posted) WHERE is_posted = true;
CREATE INDEX IF NOT EXISTS idx_generated_images_posted_at ON public.generated_images(posted_at DESC) WHERE posted_at IS NOT NULL;

-- ===============================================
-- Row Level Security (RLS) ポリシー
-- ===============================================

-- RLSを有効化
ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;

-- ポリシー1: ユーザーは自分の画像を閲覧可能
CREATE POLICY "Users can view their own images"
  ON public.generated_images
  FOR SELECT
  USING (auth.uid() = user_id);

-- ポリシー2: 投稿済み画像は全員が閲覧可能
CREATE POLICY "Posted images are viewable by everyone"
  ON public.generated_images
  FOR SELECT
  USING (is_posted = true);

-- ポリシー3: ユーザーは自分の画像を作成可能
CREATE POLICY "Users can insert their own images"
  ON public.generated_images
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ポリシー4: ユーザーは自分の画像を更新可能
CREATE POLICY "Users can update their own images"
  ON public.generated_images
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ポリシー5: ユーザーは自分の画像を削除可能
CREATE POLICY "Users can delete their own images"
  ON public.generated_images
  FOR DELETE
  USING (auth.uid() = user_id);

-- ===============================================
-- Storage バケット作成
-- ===============================================

-- generated-images バケットを作成（すでに存在する場合はスキップ）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images',
  true,  -- 公開バケット
  10485760,  -- 10MB制限
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ===============================================
-- Storage ポリシー
-- ===============================================

-- ポリシー1: 認証済みユーザーは自分のフォルダにアップロード可能
CREATE POLICY "Users can upload images to their own folder"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'generated-images' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ポリシー2: 全員が画像を閲覧可能（公開バケット）
CREATE POLICY "Images are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'generated-images');

-- ポリシー3: ユーザーは自分の画像を削除可能
CREATE POLICY "Users can delete their own images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'generated-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

