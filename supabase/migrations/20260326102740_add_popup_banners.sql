-- Popup banner system
-- Adds popup banners, per-user view state, daily analytics, and an atomic interaction RPC.

CREATE TABLE public.popup_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  storage_path text,
  link_url text,
  alt text NOT NULL,
  show_once_only boolean NOT NULL DEFAULT false,
  display_start_at timestamptz,
  display_end_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.popup_banner_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_banner_id uuid NOT NULL REFERENCES public.popup_banners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('impression', 'click', 'close', 'dismiss_forever')),
  permanently_dismissed boolean NOT NULL DEFAULT false,
  reshow_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT popup_banner_views_banner_user_unique UNIQUE (popup_banner_id, user_id)
);

CREATE TABLE public.popup_banner_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_banner_id uuid NOT NULL REFERENCES public.popup_banners(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'close', 'dismiss_forever')),
  count integer NOT NULL DEFAULT 1 CHECK (count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT popup_banner_analytics_unique UNIQUE (popup_banner_id, event_date, event_type)
);

CREATE INDEX idx_popup_banners_public_list
  ON public.popup_banners (display_order)
  WHERE status = 'published';

CREATE INDEX idx_popup_banner_views_user_updated
  ON public.popup_banner_views (user_id, updated_at DESC);

CREATE INDEX idx_popup_banner_analytics_event_date
  ON public.popup_banner_analytics (event_date DESC);

CREATE INDEX idx_popup_banner_analytics_banner_date
  ON public.popup_banner_analytics (popup_banner_id, event_date DESC);

ALTER TABLE public.popup_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_banner_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_banner_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "popup_banners_select_policy"
  ON public.popup_banners
  FOR SELECT
  USING (true);

CREATE POLICY "popup_banner_views_select_own_policy"
  ON public.popup_banner_views
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_popup_banners_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_popup_banner_views_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER popup_banners_updated_at
  BEFORE UPDATE ON public.popup_banners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_popup_banners_updated_at();

CREATE TRIGGER popup_banner_views_updated_at
  BEFORE UPDATE ON public.popup_banner_views
  FOR EACH ROW
  EXECUTE FUNCTION public.update_popup_banner_views_updated_at();

CREATE OR REPLACE FUNCTION public.record_popup_banner_interaction(
  p_banner_id uuid,
  p_user_id uuid,
  p_action_type text
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

GRANT EXECUTE ON FUNCTION public.record_popup_banner_interaction(uuid, uuid, text)
  TO service_role;

COMMENT ON TABLE public.popup_banners IS 'ホーム画面のポップアップバナー管理';
COMMENT ON TABLE public.popup_banner_views IS 'ログインユーザーごとのポップアップ表示状態';
COMMENT ON TABLE public.popup_banner_analytics IS 'ポップアップバナーの日別イベント集計';
