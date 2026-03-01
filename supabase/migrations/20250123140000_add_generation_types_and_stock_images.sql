-- ===============================================
-- Generation Types and Stock Images Migration
-- 生成タイプ対応とストック画像機能の実装
-- ===============================================

-- ===============================================
-- 1. generated_imagesテーブルの拡張
-- ===============================================

-- generation_typeカラム追加（NULL許可、デフォルト値: 'coordinate'）
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS generation_type TEXT DEFAULT 'coordinate'
CHECK (generation_type IN ('coordinate', 'specified_coordinate', 'full_body', 'chibi'));

-- input_images JSONBカラム追加（NULL許可、ログ・詳細メタ用途）
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS input_images JSONB;

-- generation_metadata JSONBカラム追加（NULL許可、ログ・詳細メタ用途）
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- source_image_stock_idカラム追加（外部キー、ON DELETE SET NULL、NULL許可）
-- 注: source_image_stocksテーブルは後で作成されるため、外部キー制約は後で追加
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS source_image_stock_id UUID;

-- ===============================================
-- 2. source_image_stocksテーブルの作成
-- ===============================================

-- source_image_stocks テーブル
-- 役割: ユーザーごとの元画像ストックを管理
CREATE TABLE IF NOT EXISTS public.source_image_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  name TEXT,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- source_image_stocksテーブルへの外部キー制約を追加
ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_source_image_stock_id_fkey
FOREIGN KEY (source_image_stock_id)
REFERENCES public.source_image_stocks(id)
ON DELETE SET NULL;

-- ===============================================
-- 3. profilesテーブルの拡張
-- ===============================================

-- subscription_planカラム追加（デフォルト値: 'free'、NULL許可）
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free'
CHECK (subscription_plan IN ('free', 'plan_a', 'plan_b', 'plan_c'));

-- ===============================================
-- 4. インデックスの追加
-- ===============================================

-- generated_images.source_image_stock_id（NULLでないもののみ）
CREATE INDEX IF NOT EXISTS idx_generated_images_source_stock_id
ON public.generated_images(source_image_stock_id)
WHERE source_image_stock_id IS NOT NULL;

-- generated_images.generation_type
CREATE INDEX IF NOT EXISTS idx_generated_images_generation_type
ON public.generated_images(generation_type);

-- source_image_stocks.user_id + deleted_at（論理削除されていないもののみ）
CREATE INDEX IF NOT EXISTS idx_source_image_stocks_user_id_deleted
ON public.source_image_stocks(user_id, deleted_at)
WHERE deleted_at IS NULL;

-- source_image_stocks.user_id + last_used_at（使用順での並び替え用）
CREATE INDEX IF NOT EXISTS idx_source_image_stocks_user_id_last_used
ON public.source_image_stocks(user_id, last_used_at DESC NULLS LAST)
WHERE deleted_at IS NULL;

-- partial UNIQUE INDEX（user_id + name WHERE deleted_at IS NULL）
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_image_stocks_user_id_name_unique
ON public.source_image_stocks(user_id, name)
WHERE deleted_at IS NULL AND name IS NOT NULL;

-- ===============================================
-- 5. RLS ポリシー
-- ===============================================

-- source_image_stocks: RLSを有効化
ALTER TABLE public.source_image_stocks ENABLE ROW LEVEL SECURITY;

-- source_image_stocks: SELECT - ユーザー本人のみ閲覧可能
CREATE POLICY "Allow users to read their own source_image_stocks"
  ON public.source_image_stocks
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- source_image_stocks: INSERT - 認証ユーザーが自分のストック画像を作成可能
CREATE POLICY "Allow authenticated users to insert their own source_image_stocks"
  ON public.source_image_stocks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- source_image_stocks: UPDATE - ユーザー本人のみ更新可能
CREATE POLICY "Allow users to update their own source_image_stocks"
  ON public.source_image_stocks
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- source_image_stocks: DELETE - ユーザー本人のみ削除可能（論理削除）
CREATE POLICY "Allow users to delete their own source_image_stocks"
  ON public.source_image_stocks
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- ===============================================
-- 6. updated_at自動更新トリガー
-- ===============================================

-- トリガー作成: source_image_stocksのupdated_atを自動更新
DROP TRIGGER IF EXISTS update_source_image_stocks_updated_at ON public.source_image_stocks;
CREATE TRIGGER update_source_image_stocks_updated_at
  BEFORE UPDATE ON public.source_image_stocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===============================================
-- 7. 既存データの移行
-- ===============================================

-- generation_type = 'coordinate'を設定（既存データは全て'coordinate'として扱う）
UPDATE public.generated_images
SET generation_type = 'coordinate'
WHERE generation_type IS NULL;

-- background_changeをgeneration_metadataに移行（オプション）
-- 既存のbackground_changeがtrueの場合は、generation_metadataに含める
UPDATE public.generated_images
SET generation_metadata = jsonb_build_object('background_change', background_change)
WHERE generation_metadata IS NULL AND background_change IS NOT NULL;

-- ===============================================
-- 8. ロールバック手順（down手順）
-- ===============================================
-- 必要に応じて以下のSQLを実行してロールバック可能:
--
-- -- 外部キー制約の削除
-- ALTER TABLE public.generated_images
-- DROP CONSTRAINT IF EXISTS generated_images_source_image_stock_id_fkey;
--
-- -- カラムの削除
-- ALTER TABLE public.generated_images
-- DROP COLUMN IF EXISTS generation_type,
-- DROP COLUMN IF EXISTS input_images,
-- DROP COLUMN IF EXISTS generation_metadata,
-- DROP COLUMN IF EXISTS source_image_stock_id;
--
-- -- テーブルの削除
-- DROP TABLE IF EXISTS public.source_image_stocks CASCADE;
--
-- -- profilesテーブルのカラム削除
-- ALTER TABLE public.profiles
-- DROP COLUMN IF EXISTS subscription_plan;
--
-- -- インデックスの削除
-- DROP INDEX IF EXISTS idx_generated_images_source_stock_id;
-- DROP INDEX IF EXISTS idx_generated_images_generation_type;
-- DROP INDEX IF EXISTS idx_source_image_stocks_user_id_deleted;
-- DROP INDEX IF EXISTS idx_source_image_stocks_user_id_last_used;
-- DROP INDEX IF EXISTS idx_source_image_stocks_user_id_name_unique;

