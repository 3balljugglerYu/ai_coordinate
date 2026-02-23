-- バナー管理テーブル
-- ホーム画面に表示するバナーを管理（表示期間、遷移先URL、画像など）

CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  storage_path text,
  link_url text NOT NULL,
  alt text NOT NULL,
  display_start_at timestamptz,
  display_end_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- インデックス（supabase-postgres-best-practices: 公開バナー取得クエリ用）
-- 条件: status='published', 並び: display_order ASC
CREATE INDEX idx_banners_public_list ON public.banners (display_order)
  WHERE status = 'published';

-- RLS有効化
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- 全ユーザーがSELECT可能（公開バナーの取得用）
CREATE POLICY "banners_select_policy" ON public.banners FOR SELECT USING (true);

-- INSERT/UPDATE/DELETEはService Role経由のみ（管理APIが使用）
-- anon/authenticatedからは直接操作不可（管理APIはrequireAdminで認証後、createAdminClient使用）

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_banners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER banners_updated_at
  BEFORE UPDATE ON public.banners
  FOR EACH ROW
  EXECUTE FUNCTION update_banners_updated_at();

COMMENT ON TABLE public.banners IS 'ホーム画面バナー管理（表示期間・遷移先URL・画像）';
