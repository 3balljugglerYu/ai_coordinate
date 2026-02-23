-- フリー素材画像管理テーブル
-- 管理画面で設定した画像を /free-materials 等のページで表示

CREATE TABLE public.materials_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  alt text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- インデックス（公開取得クエリ用: page_slug + display_order）
CREATE INDEX idx_materials_images_page_display
  ON public.materials_images (page_slug, display_order);

-- RLS有効化
ALTER TABLE public.materials_images ENABLE ROW LEVEL SECURITY;

-- 全ユーザーがSELECT可能（公開ページの画像取得用）
CREATE POLICY "materials_images_select_policy" ON public.materials_images FOR SELECT USING (true);

-- INSERT/UPDATE/DELETEはService Role経由のみ（管理APIが使用）

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_materials_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER materials_images_updated_at
  BEFORE UPDATE ON public.materials_images
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_images_updated_at();

COMMENT ON TABLE public.materials_images IS 'フリー素材等の管理画像（page_slug単位で表示）';
