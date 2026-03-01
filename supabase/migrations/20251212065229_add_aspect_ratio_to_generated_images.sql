-- ===============================================
-- Add aspect_ratio column to generated_images
-- 画像アスペクト比の事前計算・キャッシュ機能の実装
-- ===============================================

-- ===============================================
-- 1. generated_imagesテーブルにaspect_ratioカラムを追加
-- ===============================================

-- aspect_ratioカラム追加（TEXT型、'portrait' | 'landscape' | null）
-- 現時点では「縦長/横長で枠を切り替える」目的のため、向きのみで十分
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS aspect_ratio TEXT
CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('portrait', 'landscape'));

-- ===============================================
-- 2. インデックスの追加（オプション）
-- ===============================================

-- aspect_ratioカラムにインデックスを追加（NULLでないもののみ）
-- 将来的にアスペクト比でフィルタリングする場合に備える
CREATE INDEX IF NOT EXISTS idx_generated_images_aspect_ratio
ON public.generated_images(aspect_ratio)
WHERE aspect_ratio IS NOT NULL;
