-- One-Tap Style の authenticated 日次制限を check + consume 一体で処理する

CREATE OR REPLACE FUNCTION public.consume_style_authenticated_generate_attempt(
  p_user_id UUID,
  p_style_id TEXT DEFAULT NULL,
  p_daily_limit INTEGER DEFAULT 6,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT COUNT(*)
  INTO v_attempt_count
  FROM public.style_usage_events
  WHERE user_id = p_user_id
    AND auth_state = 'authenticated'
    AND event_type = 'generate_attempt'
    AND created_at >= (p_now - interval '24 hours');

  IF v_attempt_count >= p_daily_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.style_usage_events (
    user_id,
    auth_state,
    event_type,
    style_id,
    created_at
  )
  VALUES (
    p_user_id,
    'authenticated',
    'generate_attempt',
    p_style_id,
    p_now
  );

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_style_authenticated_generate_attempt(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_style_authenticated_generate_attempt(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  TO service_role;
