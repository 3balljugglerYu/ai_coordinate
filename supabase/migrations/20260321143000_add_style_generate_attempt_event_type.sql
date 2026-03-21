-- One-Tap Style の認証ユーザー日次制限を generate attempt ベースで集計する

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_event_type_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_event_type_check
  CHECK (
    event_type IN (
      'visit',
      'generate_attempt',
      'generate',
      'download',
      'rate_limited'
    )
  );

COMMENT ON COLUMN public.style_usage_events.event_type IS
  'visit / generate_attempt / generate / download / rate_limited';

CREATE INDEX IF NOT EXISTS idx_style_usage_events_user_auth_event_created_at
  ON public.style_usage_events (user_id, auth_state, event_type, created_at DESC);
