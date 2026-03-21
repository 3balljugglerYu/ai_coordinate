-- One-Tap Style の利用計測
-- visit / generate / download を append-only で記録し、Admin 集計に利用する

CREATE TABLE IF NOT EXISTS public.style_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('visit', 'generate', 'download')
  ),
  style_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.style_usage_events IS 'One-Tap Style の利用イベントログ';
COMMENT ON COLUMN public.style_usage_events.user_id IS 'イベントを発生させた auth.users.id';
COMMENT ON COLUMN public.style_usage_events.event_type IS 'visit / generate / download';
COMMENT ON COLUMN public.style_usage_events.style_id IS '対象スタイルID（未設定時はNULL）';

CREATE INDEX IF NOT EXISTS idx_style_usage_events_created_at
  ON public.style_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_usage_events_event_type_created_at
  ON public.style_usage_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_usage_events_user_id_created_at
  ON public.style_usage_events (user_id, created_at DESC);

ALTER TABLE public.style_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "style_usage_events_no_public_access" ON public.style_usage_events;
CREATE POLICY "style_usage_events_no_public_access"
  ON public.style_usage_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.style_usage_events FROM PUBLIC;
REVOKE ALL ON public.style_usage_events FROM anon;
REVOKE ALL ON public.style_usage_events FROM authenticated;
