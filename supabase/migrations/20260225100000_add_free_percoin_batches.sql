-- 無償ペルコイン月単位失効: free_percoin_batches, free_percoin_expiration_log 新設
-- promo_balance 廃止、既存 promo を free_percoin_batches に移行

-- 1. free_percoin_batches テーブル
CREATE TABLE public.free_percoin_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  remaining_amount INTEGER NOT NULL CHECK (remaining_amount >= 0),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'signup_bonus', 'tour_bonus', 'referral', 'daily_post', 'streak', 'admin_bonus', 'refund'
  )),
  credit_transaction_id UUID REFERENCES public.credit_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT remaining_lte_amount CHECK (remaining_amount <= amount)
);

-- 2. free_percoin_expiration_log テーブル
CREATE TABLE public.free_percoin_expiration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount_expired INTEGER NOT NULL,
  original_amount INTEGER NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  expire_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'monthly_expiration',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT free_percoin_expiration_log_batch_unique UNIQUE (batch_id),
  CONSTRAINT expiration_log_reason_check CHECK (reason IN (
    'monthly_expiration', 'manual_expiration', 'fraud_adjustment', 'account_freeze'
  ))
);

-- 3. インデックス
CREATE INDEX idx_fpb_user_expire ON public.free_percoin_batches (user_id, expire_at);
CREATE INDEX idx_fpb_expire ON public.free_percoin_batches (expire_at);
CREATE INDEX idx_fpb_user_remaining ON public.free_percoin_batches (user_id)
  WHERE remaining_amount > 0;
CREATE INDEX idx_fpb_user_remaining_cover ON public.free_percoin_batches (user_id, remaining_amount)
  WHERE remaining_amount > 0;

-- 4. RLS
ALTER TABLE public.free_percoin_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY free_percoin_batches_user_select ON public.free_percoin_batches
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.free_percoin_expiration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY free_percoin_expiration_log_user_select ON public.free_percoin_expiration_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5. REVOKE（anon/authenticated から直接更新禁止）
REVOKE ALL ON public.free_percoin_batches FROM anon;
REVOKE ALL ON public.free_percoin_batches FROM authenticated;
REVOKE ALL ON public.free_percoin_expiration_log FROM anon;
REVOKE ALL ON public.free_percoin_expiration_log FROM authenticated;

-- 6. 既存 promo_balance を free_percoin_batches に移行（expire_at = now() + 6 months）
INSERT INTO public.free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source)
SELECT
  user_id,
  promo_balance,
  promo_balance,
  now(),
  (now() + interval '6 months')::timestamptz,
  'admin_bonus'
FROM public.user_credits
WHERE promo_balance > 0;

-- 7. user_credits から promo_balance 列を削除（CHECK 制約は列削除で自動削除）
ALTER TABLE public.user_credits DROP COLUMN IF EXISTS promo_balance;
