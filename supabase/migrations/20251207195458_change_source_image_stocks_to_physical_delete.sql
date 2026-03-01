-- ===============================================
-- Change source_image_stocks to Physical Delete
-- ストック画像の削除を論理削除から物理削除に変更
-- ===============================================

-- ===============================================
-- 1. RLSポリシーの修正
-- ===============================================

-- UPDATEポリシーからdeleted_at条件を削除
DROP POLICY IF EXISTS "Allow users to update their own source_image_stocks"
  ON public.source_image_stocks;

CREATE POLICY "Allow users to update their own source_image_stocks"
  ON public.source_image_stocks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETEポリシーを追加（物理削除用）
DROP POLICY IF EXISTS "Allow users to delete their own source_image_stocks"
  ON public.source_image_stocks;

CREATE POLICY "Allow users to delete their own source_image_stocks"
  ON public.source_image_stocks
  FOR DELETE
  USING (auth.uid() = user_id);

-- SELECTポリシーは既にdeleted_at条件がないため変更不要
-- （20250124011000_relax_source_image_stocks_select_rls.sqlで既に修正済み）

-- ===============================================
-- 2. 既存の論理削除データの物理削除
-- ===============================================

-- 注意: 既存の論理削除データ（deleted_at IS NOT NULL）を物理削除
-- ストレージ上の画像ファイルは、マイグレーションでは削除されません
-- 必要に応じて手動で削除するか、別途スクリプトを作成してください
DELETE FROM public.source_image_stocks
WHERE deleted_at IS NOT NULL;

-- ===============================================
-- 3. deleted_at関連のインデックスの削除
-- ===============================================

-- deleted_atを含むインデックスを削除
DROP INDEX IF EXISTS idx_source_image_stocks_user_id_deleted;
DROP INDEX IF EXISTS idx_source_image_stocks_user_id_last_used;

-- deleted_atを含まない新しいインデックスを作成
CREATE INDEX IF NOT EXISTS idx_source_image_stocks_user_id
  ON public.source_image_stocks(user_id);

CREATE INDEX IF NOT EXISTS idx_source_image_stocks_user_id_last_used
  ON public.source_image_stocks(user_id, last_used_at DESC NULLS LAST);

-- ===============================================
-- 4. deleted_atカラムの削除（オプション）
-- ===============================================

-- 将来的に論理削除に戻す可能性がある場合は、カラムを残す
-- 完全に不要と判断できる場合は、以下のコメントを外してカラムを削除

-- ALTER TABLE public.source_image_stocks
-- DROP COLUMN IF EXISTS deleted_at;

-- partial UNIQUE INDEXもdeleted_at条件を削除する必要がある
DROP INDEX IF EXISTS idx_source_image_stocks_user_id_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_image_stocks_user_id_name_unique
  ON public.source_image_stocks(user_id, name)
  WHERE name IS NOT NULL;

