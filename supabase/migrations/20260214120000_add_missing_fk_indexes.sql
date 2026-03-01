-- ===============================================
-- Add missing FK indexes
-- アドバイザー「Unindexed foreign keys」の解消
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_credit_transactions_related_generation_id
  ON public.credit_transactions(related_generation_id) WHERE related_generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_image_jobs_source_image_stock_id
  ON public.image_jobs(source_image_stock_id) WHERE source_image_stock_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications(actor_id);
