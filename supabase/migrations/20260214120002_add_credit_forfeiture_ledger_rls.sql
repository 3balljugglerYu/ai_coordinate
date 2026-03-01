-- ===============================================
-- Add RLS policy for credit_forfeiture_ledger
-- アドバイザー「RLS Enabled No Policy」の解消
-- ===============================================

-- 直アクセス禁止（service_role は RLS をバイパスするため影響なし）
CREATE POLICY "No direct access for anon and authenticated"
  ON public.credit_forfeiture_ledger
  FOR ALL
  USING (false)
  WITH CHECK (false);
