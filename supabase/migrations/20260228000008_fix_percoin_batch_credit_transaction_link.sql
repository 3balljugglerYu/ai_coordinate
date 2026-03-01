-- 期間限定ラベル表示のため、credit_transaction_id の紐付けを修正
--
-- Supabase Postgres Best Practices 準拠:
-- - security-privileges: SECURITY DEFINER + SET search_path = public（インジェクション対策）
-- - lock-short-transactions: 外部呼び出しなし、短いトランザクション

-- 1. refund_percoins: credit_transaction を先に作成し、batch に credit_transaction_id を設定
CREATE OR REPLACE FUNCTION public.refund_percoins(
  p_user_id UUID,
  p_amount INTEGER,
  p_to_promo INTEGER,
  p_to_paid INTEGER,
  p_job_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expire_at TIMESTAMPTZ;
  v_tx_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: refund_percoins can only be called with service role';
  END IF;

  IF p_amount <= 0 OR p_to_promo + p_to_paid != p_amount THEN
    RAISE EXCEPTION 'invalid refund amounts';
  END IF;

  IF p_job_id IS NOT NULL AND p_job_id != '' THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE user_id = p_user_id AND transaction_type = 'refund' AND metadata->>'job_id' = p_job_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- credit_transaction を先に作成（取引履歴での期間限定表示のため）
  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id, p_amount, 'refund',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('to_promo', p_to_promo, 'to_paid', p_to_paid, 'job_id', p_job_id)
  )
  RETURNING id INTO v_tx_id;

  IF p_to_promo > 0 THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
    VALUES (p_user_id, p_to_promo, p_to_promo, now(), v_expire_at, 'refund', v_tx_id);
  END IF;

  UPDATE user_credits
  SET paid_balance = paid_balance + p_to_paid,
      balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- 2. 既存の free_percoin_batches で credit_transaction_id が NULL のものをバックフィル
-- 通常: user_id, source=transaction_type, amount 一致、時刻が近い（5分以内）
-- refund: user_id, transaction_type='refund', metadata->>'to_promo' = batch.amount
WITH batch_to_link AS (
  SELECT fpb.id AS batch_id,
         (
           SELECT ct.id
           FROM credit_transactions ct
           WHERE ct.user_id = fpb.user_id
             AND ct.transaction_type = fpb.source
             AND (
               -- 通常: amount 一致
               (fpb.source != 'refund' AND ct.amount = fpb.amount)
               OR
               -- refund: metadata.to_promo と batch.amount 一致
               (fpb.source = 'refund' AND (ct.metadata->>'to_promo')::int = fpb.amount)
             )
             AND ct.created_at BETWEEN fpb.granted_at - interval '5 minutes'
                                  AND fpb.granted_at + interval '5 minutes'
             AND NOT EXISTS (
               SELECT 1 FROM free_percoin_batches f2
               WHERE f2.credit_transaction_id = ct.id
             )
           ORDER BY abs(EXTRACT(EPOCH FROM (ct.created_at - fpb.granted_at)))
           LIMIT 1
         ) AS tx_id
  FROM free_percoin_batches fpb
  WHERE fpb.credit_transaction_id IS NULL
    AND fpb.source IN ('signup_bonus', 'tour_bonus', 'referral', 'daily_post', 'streak', 'admin_bonus', 'refund')
)
UPDATE free_percoin_batches fpb
SET credit_transaction_id = btl.tx_id
FROM batch_to_link btl
WHERE fpb.id = btl.batch_id
  AND btl.tx_id IS NOT NULL;
