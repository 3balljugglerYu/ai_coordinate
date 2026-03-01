-- ===============================================
-- Admin Bonus Function Migration
-- 運営者からのボーナス付与機能: grant_admin_bonus RPC関数の作成
-- ===============================================

CREATE OR REPLACE FUNCTION public.grant_admin_bonus(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_admin_id UUID,
  p_send_notification BOOLEAN DEFAULT true
)
RETURNS TABLE(amount_granted INTEGER, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_transaction_id UUID;
BEGIN
  -- バリデーション: ペルコイン数が1以上であることを確認
  IF p_amount < 1 THEN
    RAISE EXCEPTION 'Invalid amount: amount must be at least 1';
  END IF;

  -- バリデーション: 付与理由が1文字以上500文字以下であることを確認
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Invalid reason: reason must be between 1 and 500 characters';
  END IF;

  -- ユーザーが存在することを確認
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: user_id = %', p_user_id;
  END IF;

  -- 管理者が存在することを確認
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
    RAISE EXCEPTION 'Admin user not found: admin_id = %', p_admin_id;
  END IF;

  -- ペルコイン残高を更新（user_creditsテーブルが存在しない場合は作成）
  INSERT INTO user_credits (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + p_amount,
      updated_at = NOW();

  -- 取引履歴を記録
  INSERT INTO credit_transactions (
    user_id,
    amount,
    transaction_type,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,
    'admin_bonus',
    jsonb_build_object(
      'reason', trim(p_reason),
      'admin_id', p_admin_id,
      'granted_at', NOW()
    )
  )
  RETURNING id INTO v_transaction_id;

  -- 通知送信が有効な場合、通知レコードを作成
  IF p_send_notification THEN
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
      '運営者からのボーナス！',
      p_amount || 'ペルコインが付与されました。' || trim(p_reason),
      jsonb_build_object(
        'bonus_amount', p_amount,
        'bonus_type', 'admin_bonus',
        'reason', trim(p_reason),
        'admin_id', p_admin_id,
        'granted_at', NOW()
      ),
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  -- 付与されたペルコイン数とトランザクションIDを返す
  RETURN QUERY SELECT p_amount, v_transaction_id;
END;
$$;
