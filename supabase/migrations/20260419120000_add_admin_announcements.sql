-- Admin-managed announcements for /notifications

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_page_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS announcements_tab_seen_at timestamptz;

CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  body_json jsonb NOT NULL,
  body_text text NOT NULL DEFAULT '',
  asset_paths text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  publish_at timestamptz,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_announcements_publish_requires_publish_at
    CHECK (status <> 'published' OR publish_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.admin_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_announcements_public_publish_at
  ON public.admin_announcements (publish_at DESC, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_read_at
  ON public.announcement_reads (user_id, read_at DESC);

ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_announcements_select_published_live" ON public.admin_announcements;
CREATE POLICY "admin_announcements_select_published_live"
  ON public.admin_announcements
  FOR SELECT
  USING (
    status = 'published'
    AND publish_at <= now()
  );

DROP POLICY IF EXISTS "announcement_reads_select_own" ON public.announcement_reads;
CREATE POLICY "announcement_reads_select_own"
  ON public.announcement_reads
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "announcement_reads_insert_own" ON public.announcement_reads;
CREATE POLICY "announcement_reads_insert_own"
  ON public.announcement_reads
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "announcement_reads_update_own" ON public.announcement_reads;
CREATE POLICY "announcement_reads_update_own"
  ON public.announcement_reads
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_admin_announcements_updated_at ON public.admin_announcements;
CREATE TRIGGER update_admin_announcements_updated_at
  BEFORE UPDATE ON public.admin_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.admin_announcements IS '運営が管理する /notifications 用お知らせ';
COMMENT ON COLUMN public.admin_announcements.title IS 'お知らせタイトル';
COMMENT ON COLUMN public.admin_announcements.body_json IS 'Tiptap のリッチテキスト JSON';
COMMENT ON COLUMN public.admin_announcements.body_text IS '検索・fallback 用のプレーンテキスト';
COMMENT ON COLUMN public.admin_announcements.asset_paths IS '本文内画像の Supabase Storage path 一覧';
COMMENT ON COLUMN public.admin_announcements.status IS 'draft / published';
COMMENT ON COLUMN public.admin_announcements.publish_at IS '公開日時。published の場合は必須';
COMMENT ON TABLE public.announcement_reads IS 'ユーザーごとのお知らせ既読状態';
COMMENT ON COLUMN public.profiles.notifications_page_seen_at IS '/notifications ページを最後に開いた日時';
COMMENT ON COLUMN public.profiles.announcements_tab_seen_at IS '/notifications の運営お知らせタブを最後に開いた日時';
