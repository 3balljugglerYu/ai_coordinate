-- Fix: Function Search Path Mutable (Lint 0011)
-- pgmq_read, pgmq_send, pgmq_delete に search_path を明示的に設定
-- 参照: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0011_function_search_path_mutable

CREATE OR REPLACE FUNCTION public.pgmq_read(p_queue_name text, p_vt integer DEFAULT 30, p_qty integer DEFAULT 1)
RETURNS SETOF pgmq.message_record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT * FROM pgmq.read(p_queue_name, p_vt, p_qty);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pgmq_send(p_queue_name text, p_message jsonb, p_delay integer DEFAULT 0)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_msg_id BIGINT;
BEGIN
  SELECT pgmq.send(p_queue_name, p_message, p_delay) INTO v_msg_id;
  RETURN v_msg_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(p_queue_name text, p_msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM pgmq.delete(p_queue_name, p_msg_id);
  RETURN TRUE;
END;
$function$;
