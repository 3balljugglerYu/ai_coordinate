-- pg_trgm拡張を有効化（部分一致検索に最適）
-- エラーが発生した場合はスキップ（通常のB-treeインデックスにフォールバック可能）
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension could not be created: %', SQLERRM;
END $$;

-- GIN + trigramインデックス（部分一致検索に最適）
-- %word%形式の検索でパフォーマンスが向上
CREATE INDEX IF NOT EXISTS idx_generated_images_prompt_trgm 
ON public.generated_images 
USING gin (prompt gin_trgm_ops)
WHERE is_posted = true;

-- ロールバック用（必要に応じて実行）
-- DROP INDEX IF EXISTS idx_generated_images_prompt_trgm;
-- DROP EXTENSION IF EXISTS pg_trgm;

