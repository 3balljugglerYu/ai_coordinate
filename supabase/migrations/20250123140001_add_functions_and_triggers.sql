-- ===============================================
-- Functions and Triggers Migration
-- データベース関数とトリガーの実装
-- ===============================================

-- ===============================================
-- 1. ユーティリティ関数の作成（SECURITY INVOKER + auth.uid()）
-- ===============================================

-- ストック画像制限数を取得する関数
-- ログイン中のユーザーのストック画像制限数を取得（user_id引数なし、auth.uid()を使用）
CREATE OR REPLACE FUNCTION public.get_stock_image_limit()
RETURNS INTEGER AS $$
DECLARE
  plan TEXT;
  user_id_param UUID;
BEGIN
  -- auth.uid()を取得
  user_id_param := auth.uid();
  
  IF user_id_param IS NULL THEN
    RETURN 0;
  END IF;
  
  -- profilesテーブルからsubscription_planを取得
  SELECT subscription_plan INTO plan
  FROM public.profiles
  WHERE user_id = user_id_param;
  
  -- プラン別の制限数を返す
  RETURN CASE COALESCE(plan, 'free')
    WHEN 'plan_a' THEN 10
    WHEN 'plan_b' THEN 30
    WHEN 'plan_c' THEN 50
    ELSE 3 -- デフォルト（free）
  END;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- ストック画像の使用回数を取得する関数
-- RLSで制御されるため、ユーザー本人のストック画像のみ取得可能
CREATE OR REPLACE FUNCTION public.get_stock_image_usage_count(stock_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*) INTO count
  FROM public.generated_images
  WHERE source_image_stock_id = stock_id_param;
  
  RETURN COALESCE(count, 0);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- ===============================================
-- 2. トリガー関数の作成（軽量化）
-- ===============================================

-- ストック画像のlast_used_atとusage_countを自動更新するトリガー関数
-- source_image_stock_id IS NULLの場合は即returnして軽量化
CREATE OR REPLACE FUNCTION public.update_stock_image_last_used()
RETURNS TRIGGER AS $$
BEGIN
  -- source_image_stock_idがNULLの場合は早期リターン
  IF NEW.source_image_stock_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- ストック画像のlast_used_atとusage_countを更新
  UPDATE public.source_image_stocks
  SET 
    last_used_at = NOW(),
    usage_count = usage_count + 1,
    updated_at = NOW()
  WHERE id = NEW.source_image_stock_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成（AFTER INSERT ON generated_images）
DROP TRIGGER IF EXISTS trigger_update_stock_image_last_used ON public.generated_images;
CREATE TRIGGER trigger_update_stock_image_last_used
  AFTER INSERT ON public.generated_images
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stock_image_last_used();

-- ===============================================
-- 3. ロールバック手順（down手順）
-- ===============================================
-- 必要に応じて以下のSQLを実行してロールバック可能:
--
-- -- トリガーの削除
-- DROP TRIGGER IF EXISTS trigger_update_stock_image_last_used ON public.generated_images;
--
-- -- 関数の削除
-- DROP FUNCTION IF EXISTS public.update_stock_image_last_used();
-- DROP FUNCTION IF EXISTS public.get_stock_image_usage_count(UUID);
-- DROP FUNCTION IF EXISTS public.get_stock_image_limit();

