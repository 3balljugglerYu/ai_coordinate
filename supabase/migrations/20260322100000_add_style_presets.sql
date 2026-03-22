-- One-Tap Style のスタイル定義をDB管理へ移行する

CREATE TABLE IF NOT EXISTS public.style_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  thumbnail_image_url TEXT NOT NULL,
  thumbnail_storage_path TEXT NULL,
  thumbnail_width INTEGER NOT NULL CHECK (thumbnail_width > 0),
  thumbnail_height INTEGER NOT NULL CHECK (thumbnail_height > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_style_presets_public_order
  ON public.style_presets (sort_order)
  WHERE status = 'published';

ALTER TABLE public.style_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "style_presets_select_published" ON public.style_presets;
CREATE POLICY "style_presets_select_published"
  ON public.style_presets
  FOR SELECT
  USING (status = 'published');

DROP TRIGGER IF EXISTS update_style_presets_updated_at ON public.style_presets;
CREATE TRIGGER update_style_presets_updated_at
  BEFORE UPDATE ON public.style_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.style_presets IS 'One-Tap Style の管理プリセット';
COMMENT ON COLUMN public.style_presets.slug IS '管理用一意slug';
COMMENT ON COLUMN public.style_presets.title IS '管理画面・/style に表示するタイトル';
COMMENT ON COLUMN public.style_presets.prompt IS '生成時に使用するスタイルprompt';
COMMENT ON COLUMN public.style_presets.thumbnail_image_url IS 'サムネイル画像URL';
COMMENT ON COLUMN public.style_presets.thumbnail_storage_path IS 'Supabase Storage の保存先。seedデータはNULL可';
COMMENT ON COLUMN public.style_presets.sort_order IS '公開一覧の表示順';
COMMENT ON COLUMN public.style_presets.status IS 'draft / published';
