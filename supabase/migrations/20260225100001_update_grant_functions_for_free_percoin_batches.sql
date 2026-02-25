-- 付与 RPC 5 種を free_percoin_batches にバッチ INSERT するよう変更
-- expire_at: 付与月 + 6ヶ月後の月末 23:59:59 JST

-- expire_at 算出式（共通）
-- (date_trunc('month', granted_at AT TIME ZONE 'Asia/Tokyo') + interval '7 months' - interval '1 second') AT TIME ZONE 'Asia/Tokyo'

-- 1. grant_tour_bonus
CREATE OR REPLACE FUNCTION public.grant_tour_bonus(p_user_id UUID)
RETURNS TABLE(amount_granted INTEGER, already_completed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount INTEGER := 20;
  v_caller_id UUID;
  v_rows_updated INTEGER;
  v_tx_id UUID;
  v_expire_at TIMESTAMPTZ;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only grant tour bonus to self';
  END IF;

  BEGIN
    INSERT INTO public.credit_transactions (
      user_id, amount, transaction_type, related_generation_id, metadata
    ) VALUES (
      p_user_id, v_amount, 'tour_bonus', NULL,
      jsonb_build_object('reason', 'tutorial_completion', 'source', 'grant_tour_bonus')
    )
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 0::INTEGER, TRUE::BOOLEAN;
    RETURN;
  END;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (p_user_id, v_amount, v_amount, now(), v_expire_at, 'tour_bonus', v_tx_id);

  UPDATE public.user_credits
  SET balance = balance + v_amount, updated_at = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (p_user_id, v_amount, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + v_amount,
      updated_at = now();
  END IF;

  BEGIN
    INSERT INTO public.notifications (
      recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at
    ) VALUES (
      p_user_id, p_user_id, 'bonus', 'user', p_user_id,
      'チュートリアルボーナス獲得！',
      'チュートリアル完了で20ペルコインを獲得しました！',
      jsonb_build_object('bonus_amount', v_amount, 'bonus_type', 'tour_bonus', 'granted_at', NOW()),
      false, NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN RAISE WARNING 'Tour bonus notification: unique_violation (%), skipping', SQLERRM;
    WHEN foreign_key_violation THEN RAISE WARNING 'Tour bonus notification: foreign_key_violation (%), skipping', SQLERRM;
    WHEN not_null_violation THEN RAISE WARNING 'Tour bonus notification: not_null_violation (%), skipping', SQLERRM;
    WHEN check_violation THEN RAISE WARNING 'Tour bonus notification: check_violation (%), skipping', SQLERRM;
    WHEN OTHERS THEN RAISE WARNING 'Tour bonus notification: unexpected error (%), skipping', SQLERRM;
  END;

  RETURN QUERY SELECT v_amount::INTEGER, FALSE::BOOLEAN;
END;
$$;

-- 2. grant_admin_bonus
CREATE OR REPLACE FUNCTION public.grant_admin_bonus(p_user_id uuid, p_amount integer, p_reason text, p_admin_id uuid, p_send_notification boolean DEFAULT true)
RETURNS TABLE(amount_granted integer, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
  v_transaction_id uuid;
  v_expire_at timestamptz;
BEGIN
  IF p_amount < 1 THEN
    RAISE EXCEPTION 'Invalid amount: amount must be at least 1';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Invalid reason: reason must be between 1 and 500 characters';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: user_id = %', p_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
    RAISE EXCEPTION 'Admin user not found: admin_id = %', p_admin_id;
  END IF;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id, p_amount, 'admin_bonus',
    jsonb_build_object('reason', trim(p_reason), 'admin_id', p_admin_id, 'granted_at', NOW(), 'bucket', 'promo')
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (p_user_id, p_amount, p_amount, now(), v_expire_at, 'admin_bonus', v_transaction_id);

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, p_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + p_amount, updated_at = NOW();

  IF p_send_notification THEN
    INSERT INTO notifications (
      recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at
    ) VALUES (
      p_user_id, p_admin_id, 'bonus', 'user', p_user_id,
      '運営者からのボーナス！',
      p_amount || 'ペルコインが付与されました。' || trim(p_reason),
      jsonb_build_object('bonus_amount', p_amount, 'bonus_type', 'admin_bonus', 'reason', trim(p_reason), 'admin_id', p_admin_id, 'granted_at', NOW()),
      false, NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT p_amount, v_transaction_id;
END;
$$;

-- 3. grant_referral_bonus
CREATE OR REPLACE FUNCTION public.grant_referral_bonus(p_referrer_id uuid, p_referred_id uuid, p_referral_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_referrer_code text;
  v_inserted_id uuid;
  v_bonus_amount integer := 100;
  v_notification_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
BEGIN
  IF p_referrer_id = p_referred_id THEN
    RAISE WARNING 'Self-referral is not allowed: user_id = %', p_referrer_id;
    RETURN 0;
  END IF;

  SELECT referral_code INTO v_referrer_code FROM profiles WHERE user_id = p_referrer_id;

  IF v_referrer_code IS NULL OR v_referrer_code != p_referral_code THEN
    RAISE WARNING 'Invalid referral code: expected %, got %', v_referrer_code, p_referral_code;
    RETURN 0;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
  VALUES (p_referrer_id, p_referred_id, p_referral_code)
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_referrer_id, v_bonus_amount, 'referral',
      jsonb_build_object('referred_id', p_referred_id, 'referral_code', p_referral_code, 'granted_at', NOW(), 'bucket', 'promo')
    )
    RETURNING id INTO v_tx_id;

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
    VALUES (p_referrer_id, v_bonus_amount, v_bonus_amount, now(), v_expire_at, 'referral', v_tx_id);

    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (p_referrer_id, v_bonus_amount, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + v_bonus_amount, updated_at = NOW();

    INSERT INTO notifications (
      recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at
    ) VALUES (
      p_referrer_id, p_referrer_id, 'bonus', 'user', p_referrer_id,
      '紹介特典獲得！', '友達を紹介して100ペルコインを獲得しました！',
      jsonb_build_object('bonus_amount', v_bonus_amount, 'bonus_type', 'referral', 'referred_id', p_referred_id, 'referral_code', p_referral_code, 'granted_at', NOW()),
      false, NOW()
    ) RETURNING id INTO v_notification_id;

    RETURN v_bonus_amount;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- 4. grant_daily_post_bonus
CREATE OR REPLACE FUNCTION public.grant_daily_post_bonus(p_user_id uuid, p_generation_id uuid)
RETURNS integer
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
  v_tx_id UUID;
  v_expire_at TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*) INTO v_existing_transaction_count
  FROM credit_transactions
  WHERE related_generation_id = p_generation_id AND transaction_type = 'daily_post' AND user_id = p_user_id;

  IF v_existing_transaction_count > 0 THEN
    RETURN 0;
  END IF;

  v_current_jst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;

  SELECT last_daily_post_bonus_at INTO v_last_bonus_at FROM profiles WHERE user_id = p_user_id;

  IF v_last_bonus_at IS NOT NULL THEN
    v_last_bonus_jst_date := (v_last_bonus_at AT TIME ZONE 'Asia/Tokyo')::DATE;
  END IF;

  IF v_last_bonus_at IS NULL OR v_last_bonus_jst_date < v_current_jst_date THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO credit_transactions (user_id, amount, transaction_type, related_generation_id, metadata)
    VALUES (p_user_id, v_bonus_amount, 'daily_post', p_generation_id, jsonb_build_object('posted_at', NOW()))
    RETURNING id INTO v_tx_id;

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
    VALUES (p_user_id, v_bonus_amount, v_bonus_amount, now(), v_expire_at, 'daily_post', v_tx_id);

    INSERT INTO user_credits (user_id, balance, paid_balance)
    VALUES (p_user_id, v_bonus_amount, 0)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_credits.balance + v_bonus_amount, updated_at = NOW();

    UPDATE profiles SET last_daily_post_bonus_at = NOW(), updated_at = NOW() WHERE user_id = p_user_id;

    INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at)
    VALUES (p_user_id, p_user_id, 'bonus', 'post', p_generation_id, 'デイリー投稿特典獲得！', '今日の投稿で' || v_bonus_amount || 'ペルコインを獲得しました！', jsonb_build_object('bonus_amount', v_bonus_amount, 'bonus_type', 'daily_post', 'posted_at', NOW()), false, NOW())
    RETURNING id INTO v_notification_id;

    RETURN v_bonus_amount;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- 5. grant_streak_bonus
CREATE OR REPLACE FUNCTION public.grant_streak_bonus(p_user_id uuid)
RETURNS integer
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
  v_tx_id UUID;
  v_expire_at TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*) INTO v_existing_transaction_count
  FROM credit_transactions
  WHERE user_id = p_user_id AND transaction_type = 'streak'
    AND (created_at AT TIME ZONE 'Asia/Tokyo')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;

  IF v_existing_transaction_count > 0 THEN
    RETURN 0;
  END IF;

  v_current_jst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;

  SELECT last_streak_login_at, streak_days INTO v_last_login_at, v_streak_days FROM profiles WHERE user_id = p_user_id;

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
    WHEN 1 THEN 10 WHEN 2 THEN 10 WHEN 3 THEN 20 WHEN 4 THEN 10 WHEN 5 THEN 10
    WHEN 6 THEN 10 WHEN 7 THEN 50 WHEN 8 THEN 10 WHEN 9 THEN 10 WHEN 10 THEN 10
    WHEN 11 THEN 10 WHEN 12 THEN 10 WHEN 13 THEN 10 WHEN 14 THEN 100
    ELSE 0
  END;

  IF v_bonus_amount = 0 THEN
    RETURN 0;
  END IF;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (p_user_id, v_bonus_amount, 'streak', jsonb_build_object('streak_days', v_new_streak_days, 'login_at', NOW()))
  RETURNING id INTO v_tx_id;

  INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (p_user_id, v_bonus_amount, v_bonus_amount, now(), v_expire_at, 'streak', v_tx_id);

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, v_bonus_amount, 0)
  ON CONFLICT (user_id) DO UPDATE SET balance = user_credits.balance + v_bonus_amount, updated_at = NOW();

  UPDATE profiles SET last_streak_login_at = NOW(), streak_days = v_new_streak_days, updated_at = NOW() WHERE user_id = p_user_id;

  INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at)
  VALUES (p_user_id, p_user_id, 'bonus', 'user', p_user_id, '連続ログイン特典獲得！', v_new_streak_days || '日連続ログインで' || v_bonus_amount || 'ペルコインを獲得しました！', jsonb_build_object('bonus_amount', v_bonus_amount, 'bonus_type', 'streak', 'streak_days', v_new_streak_days, 'login_at', NOW()), false, NOW())
  RETURNING id INTO v_notification_id;

  RETURN v_bonus_amount;
END;
$$;
