-- ===============================================
-- Move pg_trgm to extensions schema
-- アドバイザー「Extension in Public」の解消
-- ===============================================

-- 1. GIN インデックスを削除（pg_trgm の gin_trgm_ops に依存）
DROP INDEX IF EXISTS public.idx_generated_images_prompt_trgm;

-- 2. extensions スキーマが存在することを確認（Supabase では通常存在する）
CREATE SCHEMA IF NOT EXISTS extensions;

-- 3. pg_trgm を extensions スキーマに移動
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 4. インデックスを再作成（pg_trgm は extensions に移動済み、search_path で解決）
CREATE INDEX IF NOT EXISTS idx_generated_images_prompt_trgm
  ON public.generated_images
  USING gin (prompt gin_trgm_ops)
  WHERE is_posted = true;
