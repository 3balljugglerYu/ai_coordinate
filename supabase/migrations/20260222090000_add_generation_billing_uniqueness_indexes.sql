-- 課金整合性: ジョブ単位の重複消費・重複返金を防止
-- 事前確認:
--   transaction_type in ('consumption', 'refund') かつ metadata->>'job_id' 単位で
--   重複レコードがないことを確認してから適用すること

-- consumption: 1 user + 1 job_id につき 1 レコードのみ許可
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_one_consumption_per_job
  ON public.credit_transactions (user_id, (metadata->>'job_id'))
  WHERE transaction_type = 'consumption'
    AND metadata ? 'job_id';

-- refund: 1 user + 1 job_id につき 1 レコードのみ許可
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_one_refund_per_job
  ON public.credit_transactions (user_id, (metadata->>'job_id'))
  WHERE transaction_type = 'refund'
    AND metadata ? 'job_id';
