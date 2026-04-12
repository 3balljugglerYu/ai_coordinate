-- Add reserve/release lifecycle fields for One-Tap Style free attempts.
-- This allows system-caused failures to avoid consuming the daily quota
-- while keeping safety/policy blocks counted.

ALTER TABLE public.style_usage_events
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_reason TEXT,
  ADD COLUMN IF NOT EXISTS image_job_id UUID NULL REFERENCES public.image_jobs(id) ON DELETE SET NULL;

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_release_reason_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_release_reason_check
  CHECK (
    release_reason IS NULL OR release_reason IN (
      'upload_failed',
      'job_create_failed',
      'queue_failed',
      'timeout',
      'upstream_error',
      'no_image_generated',
      'worker_failed',
      'infra_error'
    )
  );

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_release_fields_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_release_fields_check
  CHECK (
    (released_at IS NULL AND release_reason IS NULL)
    OR
    (released_at IS NOT NULL AND release_reason IS NOT NULL)
  );

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_generate_attempt_release_only_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_generate_attempt_release_only_check
  CHECK (
    (
      released_at IS NULL
      AND release_reason IS NULL
      AND image_job_id IS NULL
    )
    OR event_type = 'generate_attempt'
  );

CREATE INDEX IF NOT EXISTS idx_style_usage_events_active_generate_attempts
  ON public.style_usage_events (user_id, created_at DESC)
  WHERE auth_state = 'authenticated'
    AND event_type = 'generate_attempt'
    AND released_at IS NULL;

ALTER TABLE public.style_guest_generate_attempts
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_reason TEXT;

ALTER TABLE public.style_guest_generate_attempts
  DROP CONSTRAINT IF EXISTS style_guest_generate_attempts_release_reason_check;

ALTER TABLE public.style_guest_generate_attempts
  ADD CONSTRAINT style_guest_generate_attempts_release_reason_check
  CHECK (
    release_reason IS NULL OR release_reason IN (
      'timeout',
      'upstream_error',
      'no_image_generated',
      'infra_error'
    )
  );

ALTER TABLE public.style_guest_generate_attempts
  DROP CONSTRAINT IF EXISTS style_guest_generate_attempts_release_fields_check;

ALTER TABLE public.style_guest_generate_attempts
  ADD CONSTRAINT style_guest_generate_attempts_release_fields_check
  CHECK (
    (released_at IS NULL AND release_reason IS NULL)
    OR
    (released_at IS NOT NULL AND release_reason IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_style_guest_generate_attempts_active_ip_created_at
  ON public.style_guest_generate_attempts (client_ip_hash, created_at DESC)
  WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION public.reserve_style_authenticated_generate_attempt(
  p_user_id UUID,
  p_style_id TEXT DEFAULT NULL,
  p_daily_limit INTEGER DEFAULT 5,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count INTEGER;
  v_attempt_id UUID;
  v_jst_day_start TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  v_jst_day_start := date_trunc('day', p_now, 'Asia/Tokyo');

  SELECT COUNT(*)
  INTO v_attempt_count
  FROM public.style_usage_events
  WHERE user_id = p_user_id
    AND auth_state = 'authenticated'
    AND event_type = 'generate_attempt'
    AND created_at >= v_jst_day_start
    AND released_at IS NULL;

  IF v_attempt_count >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'attemptId', NULL,
      'reason', 'daily_limit'
    );
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
  )
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'attemptId', v_attempt_id,
    'reason', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_style_authenticated_generate_attempt(
  p_user_id UUID,
  p_style_id TEXT DEFAULT NULL,
  p_daily_limit INTEGER DEFAULT 5,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.reserve_style_authenticated_generate_attempt(
    p_user_id,
    p_style_id,
    p_daily_limit,
    p_now
  );

  RETURN COALESCE((v_result ->> 'allowed')::BOOLEAN, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_style_authenticated_generate_attempt_job(
  p_attempt_id UUID,
  p_job_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.style_usage_events
  SET image_job_id = p_job_id
  WHERE id = p_attempt_id
    AND auth_state = 'authenticated'
    AND event_type = 'generate_attempt';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_style_authenticated_generate_attempt(
  p_attempt_id UUID,
  p_release_reason TEXT,
  p_released_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.style_usage_events
  SET released_at = p_released_at,
      release_reason = p_release_reason
  WHERE id = p_attempt_id
    AND auth_state = 'authenticated'
    AND event_type = 'generate_attempt'
    AND released_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_style_guest_generate_attempt(
  p_client_ip_hash TEXT,
  p_short_limit INTEGER DEFAULT 2,
  p_daily_limit INTEGER DEFAULT 2,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_count INTEGER;
  v_daily_count INTEGER;
  v_attempt_id UUID;
  v_jst_day_start TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_ip_hash, 0));

  v_jst_day_start := date_trunc('day', p_now, 'Asia/Tokyo');

  SELECT COUNT(*)
  INTO v_short_count
  FROM public.style_guest_generate_attempts
  WHERE client_ip_hash = p_client_ip_hash
    AND created_at >= (p_now - interval '1 minute')
    AND released_at IS NULL;

  IF v_short_count >= p_short_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'attemptId', NULL,
      'reason', 'short_limit'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_daily_count
  FROM public.style_guest_generate_attempts
  WHERE client_ip_hash = p_client_ip_hash
    AND created_at >= v_jst_day_start
    AND released_at IS NULL;

  IF v_daily_count >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'attemptId', NULL,
      'reason', 'daily_limit'
    );
  END IF;

  INSERT INTO public.style_guest_generate_attempts (
    client_ip_hash,
    created_at
  )
  VALUES (
    p_client_ip_hash,
    p_now
  )
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'attemptId', v_attempt_id,
    'reason', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_style_guest_generate_attempt(
  p_attempt_id UUID,
  p_release_reason TEXT,
  p_released_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.style_guest_generate_attempts
  SET released_at = p_released_at,
      release_reason = p_release_reason
  WHERE id = p_attempt_id
    AND released_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_style_authenticated_generate_attempt(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.attach_style_authenticated_generate_attempt_job(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_style_authenticated_generate_attempt(UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_style_guest_generate_attempt(TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_style_guest_generate_attempt(UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_style_authenticated_generate_attempt(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_style_authenticated_generate_attempt_job(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_style_authenticated_generate_attempt(UUID, TEXT, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_style_guest_generate_attempt(TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_style_guest_generate_attempt(UUID, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.reserve_style_authenticated_generate_attempt(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  IS 'authenticated の One-Tap Style generate_attempt を予約し、system failure 時に release できる attempt id を返す';
COMMENT ON FUNCTION public.release_style_authenticated_generate_attempt(UUID, TEXT, TIMESTAMPTZ)
  IS 'authenticated の予約済み One-Tap Style generate_attempt を release する';
COMMENT ON FUNCTION public.reserve_style_guest_generate_attempt(TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  IS 'guest の One-Tap Style generate_attempt を予約し、system failure 時に release できる attempt id を返す';
COMMENT ON FUNCTION public.release_style_guest_generate_attempt(UUID, TEXT, TIMESTAMPTZ)
  IS 'guest の予約済み One-Tap Style generate_attempt を release する';
