-- ===============================================
-- 2残高化後の残高ドリフト修正
-- - grant_daily_post_bonus / grant_streak_bonus を promo_balance 更新に変更
-- - 既存データの balance を paid_balance + promo_balance で再計算
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
  v_bonus_amount INTEGER := 30;
  v_notification_id UUID;
BEGIN
  SELECT COUNT(*)
  INTO v_existing_transaction_count
  FROM credit_transactions
  WHERE related_generation_id = p_generation_id
    AND transaction_type = 'daily_post'
    AND user_id = p_user_id;

  IF v_existing_transaction_count > 0 THEN
    RETURN 0;
  END IF;

  v_current_jst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;

  SELECT last_daily_post_bonus_at
  INTO v_last_bonus_at
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_last_bonus_at IS NOT NULL THEN
    v_last_bonus_jst_date := (v_last_bonus_at AT TIME ZONE 'Asia/Tokyo')::DATE;
  END IF;

  IF v_last_bonus_at IS NULL OR v_last_bonus_jst_date < v_current_jst_date THEN
    UPDATE user_credits
    SET promo_balance = promo_balance + v_bonus_amount,
        balance = paid_balance + promo_balance + v_bonus_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

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

    UPDATE profiles
    SET last_daily_post_bonus_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;

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
    RETURN 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_streak_bonus(
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_transaction_count INTEGER;
  v_last_login_at TIMESTAMPTZ;
  v_current_jst_date DATE;
  v_last_login_jst_date DATE;
  v_streak_days INTEGER;
  v_new_streak_days INTEGER;
  v_bonus_amount INTEGER;
  v_notification_id UUID;
BEGIN
  SELECT COUNT(*)
  INTO v_existing_transaction_count
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND transaction_type = 'streak'
    AND (created_at AT TIME ZONE 'Asia/Tokyo')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;

  IF v_existing_transaction_count > 0 THEN
    RETURN 0;
  END IF;

  v_current_jst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;

  SELECT last_streak_login_at, streak_days
  INTO v_last_login_at, v_streak_days
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_last_login_at IS NOT NULL THEN
    v_last_login_jst_date := (v_last_login_at AT TIME ZONE 'Asia/Tokyo')::DATE;
  END IF;

  IF v_last_login_at IS NULL THEN
    v_new_streak_days := 1;
  ELSIF v_last_login_jst_date < v_current_jst_date THEN
    IF v_last_login_jst_date = v_current_jst_date - 1 THEN
      v_new_streak_days := COALESCE(v_streak_days, 0) + 1;
      IF v_new_streak_days > 14 THEN
        v_new_streak_days := 1;
      END IF;
    ELSE
      v_new_streak_days := 1;
    END IF;
  ELSE
    RETURN 0;
  END IF;

  v_bonus_amount := CASE v_new_streak_days
    WHEN 1 THEN 10
    WHEN 2 THEN 10
    WHEN 3 THEN 20
    WHEN 4 THEN 10
    WHEN 5 THEN 10
    WHEN 6 THEN 10
    WHEN 7 THEN 50
    WHEN 8 THEN 10
    WHEN 9 THEN 10
    WHEN 10 THEN 10
    WHEN 11 THEN 10
    WHEN 12 THEN 10
    WHEN 13 THEN 10
    WHEN 14 THEN 100
    ELSE 0
  END;

  IF v_bonus_amount = 0 THEN
    RETURN 0;
  END IF;

  UPDATE user_credits
  SET promo_balance = promo_balance + v_bonus_amount,
      balance = paid_balance + promo_balance + v_bonus_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (
    user_id,
    amount,
    transaction_type,
    metadata
  ) VALUES (
    p_user_id,
    v_bonus_amount,
    'streak',
    jsonb_build_object(
      'streak_days', v_new_streak_days,
      'login_at', NOW()
    )
  );

  UPDATE profiles
  SET last_streak_login_at = NOW(),
      streak_days = v_new_streak_days,
      updated_at = NOW()
  WHERE user_id = p_user_id;

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
    'user',
    p_user_id,
    '連続ログイン特典獲得！',
    v_new_streak_days || '日連続ログインで' || v_bonus_amount || 'ペルコインを獲得しました！',
    jsonb_build_object(
      'bonus_amount', v_bonus_amount,
      'bonus_type', 'streak',
      'streak_days', v_new_streak_days,
      'login_at', NOW()
    ),
    false,
    NOW()
  )
  RETURNING id INTO v_notification_id;

  RETURN v_bonus_amount;
END;
$$;

UPDATE public.user_credits
SET balance = COALESCE(paid_balance, 0) + COALESCE(promo_balance, 0),
    updated_at = NOW()
WHERE balance IS DISTINCT FROM (COALESCE(paid_balance, 0) + COALESCE(promo_balance, 0));
