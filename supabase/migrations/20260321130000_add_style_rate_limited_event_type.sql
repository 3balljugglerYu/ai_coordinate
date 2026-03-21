-- One-Tap Style の上限到達イベントも style_usage_events に記録できるようにする

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_event_type_check
  CHECK (
    event_type IN ('visit', 'generate', 'download', 'rate_limited')
  );

COMMENT ON COLUMN public.style_usage_events.event_type IS
  'visit / generate / download / rate_limited';
