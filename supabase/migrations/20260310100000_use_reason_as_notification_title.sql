-- 運営ボーナス通知のタイトルを付与理由（p_reason）に変更
-- 従来: タイトル「運営者からのボーナス！」、本文に理由を含む
-- 変更後: タイトル＝付与理由、本文＝「〇〇ペルコインが付与されました。」

CREATE OR REPLACE FUNCTION public.grant_admin_bonus(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_admin_id uuid,
  p_send_notification boolean DEFAULT true,
  p_balance_type text DEFAULT 'period_limited'
)
RETURNS TABLE(amount_granted integer, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id uuid;
  v_transaction_id uuid;
  v_expire_at timestamptz;
  v_metadata jsonb;
  v_notification_data jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the admin (auth.uid() = p_admin_id) or use service role';
  END IF;

  IF p_amount < 1 THEN
    RAISE EXCEPTION 'Invalid amount: amount must be at least 1';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Invalid reason: reason must be between 1 and 500 characters';
  END IF;

  IF p_balance_type NOT IN ('period_limited', 'unlimited') THEN
    RAISE EXCEPTION 'Invalid balance_type: must be period_limited or unlimited';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: user_id = %', p_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
    RAISE EXCEPTION 'Admin user not found: admin_id = %', p_admin_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: admin_id = % is not an authorized admin', p_admin_id
      USING ERRCODE = '42501';
  END IF;

  IF p_balance_type = 'period_limited' THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';
  ELSE
    v_expire_at := NULL;
  END IF;

  v_metadata := jsonb_build_object(
    'reason', trim(p_reason),
    'admin_id', p_admin_id,
    'granted_at', now(),
    'balance_type', p_balance_type
  ) || CASE
    WHEN v_expire_at IS NOT NULL THEN jsonb_build_object('expire_at', v_expire_at)
    ELSE '{}'::jsonb
  END;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (p_user_id, p_amount, 'admin_bonus', v_metadata)
  RETURNING id INTO v_transaction_id;

  INSERT INTO free_percoin_batches (
    user_id,
    amount,
    remaining_amount,
    granted_at,
    expire_at,
    source,
    credit_transaction_id
  )
  VALUES (
    p_user_id,
    p_amount,
    p_amount,
    now(),
    v_expire_at,
    'admin_bonus',
    v_transaction_id
  );

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, p_amount, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + p_amount,
      updated_at = NOW();

  IF p_send_notification THEN
    v_notification_data := jsonb_build_object(
      'bonus_amount', p_amount,
      'bonus_type', 'admin_bonus',
      'reason', trim(p_reason),
      'admin_id', p_admin_id,
      'granted_at', NOW(),
      'balance_type', p_balance_type
    ) || CASE
      WHEN v_expire_at IS NOT NULL THEN jsonb_build_object('expire_at', v_expire_at)
      ELSE '{}'::jsonb
    END;

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
      p_admin_id,
      'bonus',
      'user',
      p_user_id,
      trim(p_reason),
      p_amount || 'ペルコインが付与されました。',
      v_notification_data,
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT p_amount, v_transaction_id;
END;
$function$;
