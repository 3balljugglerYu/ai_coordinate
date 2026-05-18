-- ===============================================
-- Catalog Campaigns (絵師カタログ機能: 本=企画)
-- ===============================================
-- 1 企画 = 1 冊の本。運営者 (admin) が CRUD する。
-- - status='draft': 編集中。公開ページからは見えない
-- - status='published': 公開中。/catalog および /catalog/[slug] で閲覧可
-- - end_at を超えても公開は継続（参考メタとして保持）
--
-- ADR-001: Inspire テンプレとは別テーブルとする。

CREATE TABLE IF NOT EXISTS public.catalog_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL,
  description TEXT,
  cover_storage_path TEXT,
  theme_hashtag TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_campaigns IS '絵師カタログ機能: 1 冊の本に相当する企画';
COMMENT ON COLUMN public.catalog_campaigns.slug IS '公開 URL に使う slug (英小文字・数字・ハイフン、一意)';
COMMENT ON COLUMN public.catalog_campaigns.cover_storage_path IS 'カタログ表紙画像。catalog-images バケット内のパス';
COMMENT ON COLUMN public.catalog_campaigns.theme_hashtag IS 'X 連動のハッシュタグ (任意。例: ペルスタ猫コーデ)';
COMMENT ON COLUMN public.catalog_campaigns.end_at IS '企画の終了日 (参考メタ。公開停止には使わない)';
COMMENT ON COLUMN public.catalog_campaigns.status IS 'draft=非公開, published=公開';
COMMENT ON COLUMN public.catalog_campaigns.display_order IS '企画一覧の表示順 (admin が DnD で編集)';

CREATE INDEX IF NOT EXISTS idx_catalog_campaigns_published_order
  ON public.catalog_campaigns (display_order ASC, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_catalog_campaigns_status_updated
  ON public.catalog_campaigns (status, updated_at DESC);

-- updated_at トリガ
DROP TRIGGER IF EXISTS update_catalog_campaigns_updated_at ON public.catalog_campaigns;
CREATE TRIGGER update_catalog_campaigns_updated_at
  BEFORE UPDATE ON public.catalog_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.catalog_campaigns ENABLE ROW LEVEL SECURITY;

-- SELECT: published 行は誰でも、admin は全件
DROP POLICY IF EXISTS "catalog_campaigns_select_published" ON public.catalog_campaigns;
CREATE POLICY "catalog_campaigns_select_published"
  ON public.catalog_campaigns
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "catalog_campaigns_select_admin" ON public.catalog_campaigns;
CREATE POLICY "catalog_campaigns_select_admin"
  ON public.catalog_campaigns
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- INSERT / UPDATE / DELETE は admin のみ
-- (API ハンドラで requireAdmin を通過後 service_role で書き込む想定。
--  authenticated 直接の書き込みも admin_users 経由で許可しておく)
DROP POLICY IF EXISTS "catalog_campaigns_insert_admin" ON public.catalog_campaigns;
CREATE POLICY "catalog_campaigns_insert_admin"
  ON public.catalog_campaigns
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "catalog_campaigns_update_admin" ON public.catalog_campaigns;
CREATE POLICY "catalog_campaigns_update_admin"
  ON public.catalog_campaigns
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "catalog_campaigns_delete_admin" ON public.catalog_campaigns;
CREATE POLICY "catalog_campaigns_delete_admin"
  ON public.catalog_campaigns
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.catalog_campaigns CASCADE;
-- ===============================================
