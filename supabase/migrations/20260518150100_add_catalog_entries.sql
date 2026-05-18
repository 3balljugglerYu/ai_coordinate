-- ===============================================
-- Catalog Entries (絵師カタログ機能: 各ページ=1 投稿)
-- ===============================================
-- 投稿者は会員 (auth.users) でもゲスト (未ログイン) でもよい。
-- 公開閲覧は service-role API 経由 + catalog_public_entries view 経由のみ。
-- anon と authenticated からの直接 SELECT は禁じ、PII (email, IP, UA, admin_note, token) を守る。
--
-- ADR-002: ゲスト投稿可、ツイート URL を本人確認の代替に
-- ADR-008: 本体テーブルは anon から直接 SELECT/INSERT 不可、API か view 経由

CREATE TABLE IF NOT EXISTS public.catalog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.catalog_campaigns(id) ON DELETE CASCADE,
  submitter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitter_token TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 64),
  x_account_url TEXT NOT NULL CHECK (
    x_account_url ~* '^https?://(www\.|mobile\.)?(x\.com|twitter\.com)/[A-Za-z0-9_]{1,15}/?$'
  ),
  source_tweet_url TEXT NOT NULL CHECK (
    source_tweet_url ~* '^https?://(www\.|mobile\.)?(x\.com|twitter\.com)/[A-Za-z0-9_]{1,15}/status/\d+'
  ),
  source_tweet_snapshot TEXT,
  image_storage_path TEXT NOT NULL,
  alt TEXT,
  submitter_email TEXT
    CHECK (submitter_email IS NULL OR submitter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  copyright_consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  copyright_consent_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_note TEXT,
  submitter_ip INET,
  submitter_user_agent TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_entries IS '絵師カタログの投稿 (1 ページ単位)。ゲスト投稿可';
COMMENT ON COLUMN public.catalog_entries.submitter_user_id IS '会員投稿の場合の auth.users.id。ゲストは NULL';
COMMENT ON COLUMN public.catalog_entries.submitter_token IS 'クッキー由来の投稿者識別子。会員・ゲスト共通、上限・重複検知に使用';
COMMENT ON COLUMN public.catalog_entries.x_account_url IS 'X プロフィール URL (x.com or twitter.com)';
COMMENT ON COLUMN public.catalog_entries.source_tweet_url IS 'その作品を投稿した X ツイート URL (本人確認の代替)';
COMMENT ON COLUMN public.catalog_entries.source_tweet_snapshot IS 'ツイート本文のスナップショット (ツイート削除時のフォールバック)';
COMMENT ON COLUMN public.catalog_entries.submitter_email IS '承認結果通知用メール (任意・公開しない)';
COMMENT ON COLUMN public.catalog_entries.copyright_consent_version IS '同意した利用規約・著作権ポリシーのバージョン';
COMMENT ON COLUMN public.catalog_entries.status IS 'pending=審査待ち, approved=公開中, rejected=非公開';
COMMENT ON COLUMN public.catalog_entries.submitter_ip IS '抑止用に記録。公開しない';
COMMENT ON COLUMN public.catalog_entries.submitter_user_agent IS '抑止用に記録。公開しない';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_catalog_entries_campaign_approved_order
  ON public.catalog_entries (campaign_id, display_order ASC, approved_at DESC)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_catalog_entries_campaign_status_created
  ON public.catalog_entries (campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_submitter_token_campaign
  ON public.catalog_entries (submitter_token, campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_submitter_user
  ON public.catalog_entries (submitter_user_id)
  WHERE submitter_user_id IS NOT NULL;

-- approved 行の中で同じツイート URL を重複登録できないようにする (再申請の濫用防止)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_catalog_entries_approved_source_tweet
  ON public.catalog_entries (source_tweet_url)
  WHERE status = 'approved';

-- updated_at トリガ
DROP TRIGGER IF EXISTS update_catalog_entries_updated_at ON public.catalog_entries;
CREATE TRIGGER update_catalog_entries_updated_at
  BEFORE UPDATE ON public.catalog_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 申請件数上限トリガ: 同一 (submitter_token, campaign_id) で pending+approved 計 3 件まで
CREATE OR REPLACE FUNCTION public.enforce_catalog_entry_submission_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_lock_key BIGINT;
BEGIN
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status
     AND OLD.submitter_token = NEW.submitter_token
     AND OLD.campaign_id = NEW.campaign_id THEN
    RETURN NEW;
  END IF;

  v_lock_key := hashtextextended(
    'catalog_entry_cap:' || NEW.submitter_token || ':' || NEW.campaign_id::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COUNT(*) INTO v_active_count
  FROM public.catalog_entries
  WHERE submitter_token = NEW.submitter_token
    AND campaign_id = NEW.campaign_id
    AND status IN ('pending', 'approved')
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'catalog_entry_submission_cap_exceeded'
      USING ERRCODE = '23514',
            HINT = 'A submitter can have at most 3 pending or approved entries per campaign.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_catalog_entry_submission_cap ON public.catalog_entries;
CREATE TRIGGER trg_enforce_catalog_entry_submission_cap
  BEFORE INSERT OR UPDATE OF status, submitter_token, campaign_id ON public.catalog_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_catalog_entry_submission_cap();

-- RLS
-- ADR-008: anon と authenticated から直接 SELECT/INSERT/UPDATE/DELETE できない。
--          公開閲覧は catalog_public_entries view 経由、書き込みは service_role API 経由のみ。
ALTER TABLE public.catalog_entries ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の投稿 (会員) と admin のみ。anon と他人の投稿は不可。
DROP POLICY IF EXISTS "catalog_entries_select_own" ON public.catalog_entries;
CREATE POLICY "catalog_entries_select_own"
  ON public.catalog_entries
  FOR SELECT
  USING (
    submitter_user_id IS NOT NULL
    AND submitter_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "catalog_entries_select_admin" ON public.catalog_entries;
CREATE POLICY "catalog_entries_select_admin"
  ON public.catalog_entries
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- UPDATE / DELETE: admin のみ。
DROP POLICY IF EXISTS "catalog_entries_update_admin" ON public.catalog_entries;
CREATE POLICY "catalog_entries_update_admin"
  ON public.catalog_entries
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "catalog_entries_delete_admin" ON public.catalog_entries;
CREATE POLICY "catalog_entries_delete_admin"
  ON public.catalog_entries
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  ));

-- 注: INSERT policy は anon にも authenticated にも作らない。
--      投稿は app/api/catalog/submissions/route.ts (service_role) でのみ受け付ける。

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.catalog_entries CASCADE;
-- DROP FUNCTION IF EXISTS public.enforce_catalog_entry_submission_cap();
-- ===============================================
