-- ===============================================
-- Atomic insert_source_image_stock RPC
-- レースコンディションを防ぐため、制限数チェックとINSERTを単一トランザクションで実行
-- ===============================================

CREATE OR REPLACE FUNCTION public.insert_source_image_stock(
  p_user_id UUID,
  p_image_url TEXT,
  p_storage_path TEXT,
  p_name TEXT
)
RETURNS public.source_image_stocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_count BIGINT;
  v_record public.source_image_stocks;
  v_plan TEXT;
BEGIN
  -- 本人のみ実行可能
  IF (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION '権限がありません';
  END IF;

  -- 同一ユーザーへの並行リクエストを直列化（レースコンディション防止）
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 制限数を取得（profiles.subscription_plan から）
  SELECT subscription_plan INTO v_plan
  FROM public.profiles
  WHERE user_id = p_user_id;

  v_limit := CASE COALESCE(v_plan, 'free')
    WHEN 'plan_a' THEN 10
    WHEN 'plan_b' THEN 30
    WHEN 'plan_c' THEN 50
    ELSE 3
  END;

  -- 現在の件数を取得
  SELECT COUNT(*) INTO v_count
  FROM public.source_image_stocks
  WHERE user_id = p_user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'ストック画像の上限（%枚）に達しています。不要なストックを削除するか、プランをアップグレードしてください。', v_limit;
  END IF;

  -- INSERT
  INSERT INTO public.source_image_stocks (user_id, image_url, storage_path, name)
  VALUES (p_user_id, p_image_url, p_storage_path, p_name)
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;
