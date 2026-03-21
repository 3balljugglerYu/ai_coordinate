-- One-Tap Style を未ログインでも使えるようにし、
-- 利用計測では authenticated / guest を区別して保持する

ALTER TABLE public.style_usage_events
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.style_usage_events
  ADD COLUMN IF NOT EXISTS auth_state TEXT;

UPDATE public.style_usage_events
SET auth_state = CASE
  WHEN user_id IS NULL THEN 'guest'
  ELSE 'authenticated'
END
WHERE auth_state IS NULL;

ALTER TABLE public.style_usage_events
  ALTER COLUMN auth_state SET DEFAULT 'authenticated';

ALTER TABLE public.style_usage_events
  ALTER COLUMN auth_state SET NOT NULL;

ALTER TABLE public.style_usage_events
  DROP CONSTRAINT IF EXISTS style_usage_events_auth_state_check;

ALTER TABLE public.style_usage_events
  ADD CONSTRAINT style_usage_events_auth_state_check
  CHECK (auth_state IN ('authenticated', 'guest'));

COMMENT ON COLUMN public.style_usage_events.auth_state IS '利用時の認証状態 authenticated / guest';

CREATE INDEX IF NOT EXISTS idx_style_usage_events_auth_state_created_at
  ON public.style_usage_events (auth_state, created_at DESC);
