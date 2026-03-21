-- guest の One-Tap Style 生成回数制限用
-- 生の IP は保存せず、server 側で hash 化した値だけを保持する

CREATE TABLE IF NOT EXISTS public.style_guest_generate_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.style_guest_generate_attempts IS 'One-Tap Style guest generate attempts for IP-based rate limiting';
COMMENT ON COLUMN public.style_guest_generate_attempts.client_ip_hash IS 'Salted SHA-256 hash of the guest client IP';

CREATE INDEX IF NOT EXISTS idx_style_guest_generate_attempts_ip_created_at
  ON public.style_guest_generate_attempts (client_ip_hash, created_at DESC);

ALTER TABLE public.style_guest_generate_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "style_guest_generate_attempts_no_public_access"
  ON public.style_guest_generate_attempts;

CREATE POLICY "style_guest_generate_attempts_no_public_access"
  ON public.style_guest_generate_attempts
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.style_guest_generate_attempts FROM PUBLIC;
REVOKE ALL ON public.style_guest_generate_attempts FROM anon;
REVOKE ALL ON public.style_guest_generate_attempts FROM authenticated;
