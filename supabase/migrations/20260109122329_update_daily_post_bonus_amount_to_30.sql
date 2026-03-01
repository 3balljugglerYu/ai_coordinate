-- ===============================================
-- デイリー投稿特典の金額を50ペルコインから30ペルコインに変更
-- 注意: この値は constants/index.ts の DAILY_POST_BONUS_AMOUNT と一致させる必要があります
-- ===============================================

CREATE OR REPLACE FUNCTION public.grant_daily_post_bonus(
  p_user_id UUID,
  p_generation_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_transaction_count INTEGER;
  v_last_bonus_at TIMESTAMPTZ;
  v_current_jst_date DATE;
  v_last_bonus_jst_date DATE;
  v_bonus_amount INTEGER := 30; -- 定数: constants/index.ts の DAILY_POST_BONUS_AMOUNT と一致させる
  v_notification_id UUID;
BEGIN
  -- べき等性チェック: 同じ投稿IDで既に特典が付与されているか確認
  SELECT COUNT(*)
  INTO v_existing_transaction_count
  FROM credit_transactions
  WHERE related_generation_id = p_generation_id
    AND transaction_type = 'daily_post'
    AND user_id = p_user_id;
  
  -- 既に付与済みの場合は0を返して処理を終了（べき等性を保証）
  IF v_existing_transaction_count > 0 THEN
    RETURN 0;
  END IF;
  
  -- 現在のJST日付を取得
  v_current_jst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  
  -- 最後に特典を受け取った日時を取得
  SELECT last_daily_post_bonus_at
  INTO v_last_bonus_at
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- 最後の特典日時をJST日付に変換
  IF v_last_bonus_at IS NOT NULL THEN
    v_last_bonus_jst_date := (v_last_bonus_at AT TIME ZONE 'Asia/Tokyo')::DATE;
  END IF;
  
  -- 日付が異なる場合（初回または日付変更後）のみ特典を付与
  IF v_last_bonus_at IS NULL OR v_last_bonus_jst_date < v_current_jst_date THEN
    -- ペルコイン残高を更新
    UPDATE user_credits
    SET balance = balance + v_bonus_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- 取引履歴を記録（べき等性のためにrelated_generation_idを記録）
    INSERT INTO credit_transactions (
      user_id,
      amount,
      transaction_type,
      related_generation_id,
      metadata
    ) VALUES (
      p_user_id,
      v_bonus_amount,
      'daily_post',
      p_generation_id,
      jsonb_build_object('posted_at', NOW())
    );
    
    -- 最後の特典受取日時を更新
    UPDATE profiles
    SET last_daily_post_bonus_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- 通知レコードを作成（自分自身への通知として直接INSERT）
    -- create_notification関数は自分自身への通知をスキップするため、直接INSERTする
    INSERT INTO notifications (
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      title,
      body,
      data,
      is_read,
      created_at
    ) VALUES (
      p_user_id,
      p_user_id,
      'bonus',
      'post',
      p_generation_id,
      'デイリー投稿特典獲得！',
      '今日の投稿で' || v_bonus_amount || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_bonus_amount,
        'bonus_type', 'daily_post',
        'posted_at', NOW()
      ),
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_bonus_amount;
  ELSE
    -- 同じ日に既に特典を受け取っている場合は0を返す
    RETURN 0;
  END IF;
END;
$$;

