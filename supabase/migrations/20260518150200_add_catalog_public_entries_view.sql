-- ===============================================
-- catalog_public_entries view (公開閲覧用射影)
-- ===============================================
-- ADR-008: 本体テーブル (catalog_entries) は anon から直接 SELECT させない。
-- 代わりに本 view を anon/authenticated に GRANT する。
-- 公開する列は PII を含まない必要最小限のみ。
--
-- security_invoker = OFF (default) で view 所有者 (postgres) 権限で実行される。
-- これにより catalog_entries の RLS を bypass しつつ、列射影で PII を守る。
-- view 自身で WHERE 条件を強制するため、anon が見れるのは「approved + 親 campaign が published」のみ。

CREATE OR REPLACE VIEW public.catalog_public_entries
WITH (security_invoker = false)
AS
SELECT
  e.id,
  e.campaign_id,
  e.display_name,
  e.x_account_url,
  e.source_tweet_url,
  e.image_storage_path,
  e.alt,
  e.display_order,
  e.approved_at,
  e.created_at,
  e.updated_at
FROM public.catalog_entries e
INNER JOIN public.catalog_campaigns c ON c.id = e.campaign_id
WHERE e.status = 'approved'
  AND c.status = 'published';

COMMENT ON VIEW public.catalog_public_entries IS
  '絵師カタログの公開エントリー (approved + 親企画が published のみ)。PII を除いた公開射影。';

-- 公開閲覧用に anon と authenticated に SELECT を許可
GRANT SELECT ON public.catalog_public_entries TO anon, authenticated;

-- ===============================================
-- DOWN:
-- DROP VIEW IF EXISTS public.catalog_public_entries;
-- ===============================================
