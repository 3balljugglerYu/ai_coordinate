-- DB 側でも管理者権限を判定するための最小テーブル
-- 現在の admin は seed し、既存の監査ログ上の admin も backfill する

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.admin_users IS 'DB 側の管理者権限ソース';
COMMENT ON COLUMN public.admin_users.user_id IS '管理者権限を持つ auth.users.id';
COMMENT ON COLUMN public.admin_users.created_by IS 'この権限付与を登録した管理者';

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_no_public_access" ON public.admin_users;
CREATE POLICY "admin_users_no_public_access"
  ON public.admin_users
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.admin_users FROM PUBLIC;
REVOKE ALL ON public.admin_users FROM anon;
REVOKE ALL ON public.admin_users FROM authenticated;

INSERT INTO public.admin_users (user_id, created_by)
SELECT u.id, u.id
FROM auth.users u
WHERE u.id = 'dfe54c3c-3764-4758-89eb-2bd445fdc4c6'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.admin_users (user_id, created_by)
SELECT DISTINCT u.id, u.id
FROM public.admin_audit_log aal
JOIN auth.users u
  ON u.id = aal.admin_user_id
ON CONFLICT (user_id) DO NOTHING;

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
      '運営者からのボーナス！',
      p_amount || 'ペルコインが付与されました。' || trim(p_reason),
      v_notification_data,
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN QUERY SELECT p_amount, v_transaction_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) TO service_role;
