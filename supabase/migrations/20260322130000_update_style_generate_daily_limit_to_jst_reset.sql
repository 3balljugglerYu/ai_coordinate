-- One-Tap Style の日次上限を rolling 24h ではなく JST 毎日0時リセットに揃える

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
  v_jst_day_start TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  v_jst_day_start :=
    date_trunc('day', p_now AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo';

  SELECT COUNT(*)
  INTO v_attempt_count
  FROM public.style_usage_events
  WHERE user_id = p_user_id
    AND auth_state = 'authenticated'
    AND event_type = 'generate_attempt'
    AND created_at >= v_jst_day_start;

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

COMMENT ON FUNCTION public.consume_style_authenticated_generate_attempt(UUID, TEXT, INTEGER, TIMESTAMPTZ) IS
  'authenticated の One-Tap Style generate_attempt を JST 毎日0時基準で check + consume する';
