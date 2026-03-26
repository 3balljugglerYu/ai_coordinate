-- Harden popup banner public access and interaction recording.

DROP POLICY IF EXISTS "popup_banners_select_policy"
  ON public.popup_banners;

CREATE POLICY "popup_banners_select_policy"
  ON public.popup_banners
  FOR SELECT
  USING (
    status = 'published'
    AND (display_start_at IS NULL OR display_start_at <= now())
    AND (display_end_at IS NULL OR display_end_at > now())
  );

CREATE TABLE public.popup_banner_guest_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_banner_id uuid NOT NULL REFERENCES public.popup_banners(id) ON DELETE CASCADE,
  client_ip_hash text NOT NULL,
  event_date date NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('impression', 'click', 'close', 'dismiss_forever')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT popup_banner_guest_events_daily_unique UNIQUE (
    popup_banner_id,
    client_ip_hash,
    event_date,
    action_type
  )
);

CREATE INDEX idx_popup_banner_guest_events_lookup
  ON public.popup_banner_guest_events (client_ip_hash, event_date DESC);

ALTER TABLE public.popup_banner_guest_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.popup_banner_guest_events FROM PUBLIC;
REVOKE ALL ON public.popup_banner_guest_events FROM anon;
REVOKE ALL ON public.popup_banner_guest_events FROM authenticated;

DROP FUNCTION IF EXISTS public.record_popup_banner_interaction(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.record_popup_banner_interaction(
  p_banner_id uuid,
  p_user_id uuid,
  p_action_type text,
  p_client_ip_hash text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_event_date date := timezone('utc', v_now)::date;
  v_show_once_only boolean;
  v_reshow_after timestamptz;
  v_guest_inserted_count integer := 0;
BEGIN
  IF p_action_type NOT IN ('impression', 'click', 'close', 'dismiss_forever') THEN
    RAISE EXCEPTION 'Invalid popup banner action type: %', p_action_type;
  END IF;

  SELECT pb.show_once_only
  INTO v_show_once_only
  FROM public.popup_banners pb
  WHERE pb.id = p_banner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Popup banner not found: %', p_banner_id;
  END IF;

  IF p_action_type = 'dismiss_forever' AND NOT v_show_once_only THEN
    RAISE EXCEPTION 'dismiss_forever is only allowed when show_once_only = true';
  END IF;

  IF p_user_id IS NULL THEN
    IF p_client_ip_hash IS NULL OR btrim(p_client_ip_hash) = '' THEN
      RAISE EXCEPTION 'Guest popup banner interactions require client_ip_hash';
    END IF;

    INSERT INTO public.popup_banner_guest_events (
      popup_banner_id,
      client_ip_hash,
      event_date,
      action_type
    )
    VALUES (
      p_banner_id,
      p_client_ip_hash,
      v_event_date,
      p_action_type
    )
    ON CONFLICT ON CONSTRAINT popup_banner_guest_events_daily_unique
    DO NOTHING;

    GET DIAGNOSTICS v_guest_inserted_count = ROW_COUNT;

    IF v_guest_inserted_count = 0 THEN
      RETURN;
    END IF;
  END IF;

  v_reshow_after := CASE p_action_type
    WHEN 'click' THEN v_now + interval '3 days'
    WHEN 'close' THEN v_now + interval '7 days'
    ELSE NULL
  END;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.popup_banner_views (
      popup_banner_id,
      user_id,
      action_type,
      permanently_dismissed,
      reshow_after,
      created_at,
      updated_at
    )
    VALUES (
      p_banner_id,
      p_user_id,
      p_action_type,
      p_action_type = 'dismiss_forever',
      v_reshow_after,
      v_now,
      v_now
    )
    ON CONFLICT (popup_banner_id, user_id)
    DO UPDATE SET
      action_type = EXCLUDED.action_type,
      permanently_dismissed = EXCLUDED.permanently_dismissed,
      reshow_after = EXCLUDED.reshow_after,
      updated_at = v_now;
  END IF;

  INSERT INTO public.popup_banner_analytics (
    popup_banner_id,
    event_date,
    event_type,
    count,
    created_at
  )
  VALUES (
    p_banner_id,
    v_event_date,
    p_action_type,
    1,
    v_now
  )
  ON CONFLICT (popup_banner_id, event_date, event_type)
  DO UPDATE SET count = public.popup_banner_analytics.count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_popup_banners(
  p_order uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_unique_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('popup_banners_order', 0));

  SELECT COUNT(*) INTO v_total
  FROM public.popup_banners;

  SELECT COUNT(DISTINCT id) INTO v_unique_count
  FROM unnest(COALESCE(p_order, ARRAY[]::uuid[])) AS ordered(id);

  IF COALESCE(array_length(p_order, 1), 0) <> v_total OR v_unique_count <> v_total THEN
    RAISE EXCEPTION 'order must include each popup banner exactly once';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.popup_banners pb
    WHERE NOT pb.id = ANY(p_order)
  ) THEN
    RAISE EXCEPTION 'order must include each popup banner exactly once';
  END IF;

  UPDATE public.popup_banners pb
  SET display_order = ordered.ordinality - 1
  FROM unnest(p_order) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE pb.id = ordered.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_popup_banner_interaction(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_popup_banners(uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_popup_banner_interaction(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reorder_popup_banners(uuid[])
  TO service_role;

COMMENT ON TABLE public.popup_banner_guest_events IS
  'Guest popup banner interaction dedupe table keyed by hashed client IP and UTC day';
COMMENT ON FUNCTION public.record_popup_banner_interaction(uuid, uuid, text, text) IS
  'Records popup banner interactions atomically, deduping guest analytics by banner, action, IP hash, and UTC day';
COMMENT ON FUNCTION public.reorder_popup_banners(uuid[]) IS
  'Reorders popup_banners.display_order atomically based on the provided UUID array';
