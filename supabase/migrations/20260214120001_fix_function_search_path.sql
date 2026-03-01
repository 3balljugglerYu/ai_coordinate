-- ===============================================
-- Fix function search_path
-- アドバイザー「Function Search Path Mutable」の解消
-- ===============================================

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.increment_view_count(uuid) SET search_path = public;
ALTER FUNCTION public.get_follow_counts(uuid) SET search_path = public;
ALTER FUNCTION public.get_stock_image_limit() SET search_path = public;
ALTER FUNCTION public.get_stock_image_usage_count(uuid) SET search_path = public;
ALTER FUNCTION public.update_stock_image_last_used() SET search_path = public;
