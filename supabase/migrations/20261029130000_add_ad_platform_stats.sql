-- 広告の数字を貯める（管理ダッシュボード P6・docs/planning/admin-growth-dashboard-plan.md 6-4）
--
--   ## ad_platform_daily_stats
--   Meta・X の広告の数字を、日ごと・広告ごと・内訳ごとに1行で持つ。
--   いまは管理画面から書き出しのファイル（Meta は CSV、X は .xlsx）を取り込む。
--   Meta の API からの取り込みは、トークンを登録したあとに足す（source = 'api'）。
--   同じ日・広告・内訳をもう一度取り込むと上書きする（取り込みを何度やり直しても同じ結果）。
--
--   ad_key は広告を見分ける値。X は書き出しにある Ad ID、Meta の CSV は広告 ID が無いので
--   'name:' + 広告名。X の年齢・性別・端末の内訳は書き出し全体の数字（広告ごとではない）なので、
--   'all:' + その書き出しの Ad ID を並べた値にする。
--
--   ## ad_platform_ads
--   広告ごとに、ペルスタの登録の目印（profiles.signup_source）を覚える。
--   取り込んだときに行ができ、目印は管理画面で選ぶ。目印が付くと、
--   その広告から来て登録・生成・投稿した人数を、広告の数字と並べて見られる。
--
--   ## get_ad_signup_funnel / list_recent_signup_sources
--   目印ごとの登録・生成・投稿の人数と、目印の候補を返す。生成や投稿の行を
--   画面側へ全部送らずに、DB で人数だけにする（読み込む量が増えても画面が重くならないように）。
--
-- 表も関数も service_role だけが触る（RLS 有効・policy なし）。既存の表は変えない。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ad_platform_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL
    CONSTRAINT ad_platform_daily_stats_platform_check
    CHECK (platform IN ('meta', 'x')),
  -- 広告の画面の日付（広告アカウントの時間帯。どちらも日本時間で運用している）
  stat_date date NOT NULL,
  ad_key text NOT NULL
    CONSTRAINT ad_platform_daily_stats_ad_key_length
    CHECK (char_length(ad_key) BETWEEN 1 AND 300),
  ad_name text NOT NULL
    CONSTRAINT ad_platform_daily_stats_ad_name_length
    CHECK (char_length(ad_name) BETWEEN 1 AND 300),
  breakdown_type text NOT NULL
    CONSTRAINT ad_platform_daily_stats_breakdown_type_check
    CHECK (breakdown_type IN ('none', 'age', 'gender', 'placement', 'device', 'location')),
  -- 内訳なし（none）のときだけ空文字。一意キーに入れるので NULL にしない
  breakdown_value text NOT NULL DEFAULT ''
    CONSTRAINT ad_platform_daily_stats_breakdown_value_check
    CHECK (
      char_length(breakdown_value) <= 200
      AND ((breakdown_type = 'none') = (breakdown_value = ''))
    ),
  spend_jpy numeric(12, 2) NOT NULL DEFAULT 0
    CONSTRAINT ad_platform_daily_stats_spend_check CHECK (spend_jpy >= 0),
  impressions bigint NOT NULL DEFAULT 0
    CONSTRAINT ad_platform_daily_stats_impressions_check CHECK (impressions >= 0),
  -- 書き出しに列が無いものは NULL（0 と区別する）
  reach bigint
    CONSTRAINT ad_platform_daily_stats_reach_check CHECK (reach IS NULL OR reach >= 0),
  link_clicks bigint
    CONSTRAINT ad_platform_daily_stats_link_clicks_check CHECK (link_clicks IS NULL OR link_clicks >= 0),
  landing_page_views bigint
    CONSTRAINT ad_platform_daily_stats_lpv_check CHECK (landing_page_views IS NULL OR landing_page_views >= 0),
  video_views bigint
    CONSTRAINT ad_platform_daily_stats_video_views_check CHECK (video_views IS NULL OR video_views >= 0),
  source text NOT NULL DEFAULT 'upload'
    CONSTRAINT ad_platform_daily_stats_source_check
    CHECK (source IN ('api', 'upload')),
  imported_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_platform_daily_stats_unique
    UNIQUE (platform, stat_date, ad_key, breakdown_type, breakdown_value)
);

CREATE INDEX IF NOT EXISTS ad_platform_daily_stats_stat_date_idx
  ON public.ad_platform_daily_stats (stat_date);

COMMENT ON TABLE public.ad_platform_daily_stats IS
  '広告の数字（日ごと・広告ごと・内訳ごと）。管理画面の取り込みで書く。service_role 専用';

ALTER TABLE public.ad_platform_daily_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_platform_daily_stats FROM PUBLIC;
REVOKE ALL ON TABLE public.ad_platform_daily_stats FROM anon;
REVOKE ALL ON TABLE public.ad_platform_daily_stats FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ad_platform_daily_stats TO service_role;

CREATE TABLE IF NOT EXISTS public.ad_platform_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL
    CONSTRAINT ad_platform_ads_platform_check
    CHECK (platform IN ('meta', 'x')),
  ad_key text NOT NULL
    CONSTRAINT ad_platform_ads_ad_key_length
    CHECK (char_length(ad_key) BETWEEN 1 AND 300),
  ad_name text NOT NULL
    CONSTRAINT ad_platform_ads_ad_name_length
    CHECK (char_length(ad_name) BETWEEN 1 AND 300),
  -- profiles.signup_source と同じ書式（profiles_signup_source_check）
  signup_source text
    CONSTRAINT ad_platform_ads_signup_source_check
    CHECK (signup_source IS NULL OR signup_source ~ '^[a-z0-9_-]{1,40}$'),
  updated_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_platform_ads_unique UNIQUE (platform, ad_key)
);

COMMENT ON TABLE public.ad_platform_ads IS
  '広告ごとの登録の目印（signup_source）。取り込みで行ができ、目印は管理画面で選ぶ。service_role 専用';

ALTER TABLE public.ad_platform_ads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_platform_ads FROM PUBLIC;
REVOKE ALL ON TABLE public.ad_platform_ads FROM anon;
REVOKE ALL ON TABLE public.ad_platform_ads FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ad_platform_ads TO service_role;

CREATE OR REPLACE FUNCTION public.update_ad_platform_ads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_ad_platform_ads_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_ad_platform_ads_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.update_ad_platform_ads_updated_at() FROM authenticated;

DROP TRIGGER IF EXISTS trg_update_ad_platform_ads_updated_at
  ON public.ad_platform_ads;
CREATE TRIGGER trg_update_ad_platform_ads_updated_at
  BEFORE UPDATE ON public.ad_platform_ads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ad_platform_ads_updated_at();

-- 目印ごとに、その期間（日本時間の日付・両端を含む）に登録した人と、
-- そのうち生成が1回以上成功した人・投稿が1枚以上ある人を数える。運営は p_exclude_user_ids で除く。
-- p_windows: [{"signup_source": "...", "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD"}, ...]
-- 生成・投稿の行を画面側へ全部送らずに、人数だけを返す。
CREATE OR REPLACE FUNCTION public.get_ad_signup_funnel(
  p_windows jsonb,
  p_exclude_user_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE(signup_source text, signups bigint, generated bigint, posted bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH windows AS (
    SELECT
      w->>'signup_source' AS source,
      (w->>'from_date')::date AS from_date,
      (w->>'to_date')::date AS to_date
    FROM jsonb_array_elements(COALESCE(p_windows, '[]'::jsonb)) AS w
  ),
  users AS (
    SELECT DISTINCT windows.source, p.user_id
    FROM windows
    JOIN public.profiles AS p
      ON p.signup_source = windows.source
     AND (p.created_at AT TIME ZONE 'Asia/Tokyo')::date BETWEEN windows.from_date AND windows.to_date
    WHERE NOT (p.user_id = ANY (COALESCE(p_exclude_user_ids, '{}'::uuid[])))
  )
  SELECT
    users.source,
    count(*),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.image_jobs AS j
      WHERE j.user_id = users.user_id AND j.status = 'succeeded'
    )),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.generated_images AS g
      WHERE g.user_id = users.user_id AND g.is_posted
    ))
  FROM users
  GROUP BY users.source;
$$;

-- 目印の候補（p_since 以降の登録に付いていた目印の一覧）
CREATE OR REPLACE FUNCTION public.list_recent_signup_sources(p_since timestamptz)
RETURNS TABLE(signup_source text)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT p.signup_source
  FROM public.profiles AS p
  WHERE p.signup_source IS NOT NULL
    AND p.created_at >= p_since
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_ad_signup_funnel(jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ad_signup_funnel(jsonb, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_ad_signup_funnel(jsonb, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_ad_signup_funnel(jsonb, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.list_recent_signup_sources(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_recent_signup_sources(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.list_recent_signup_sources(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_recent_signup_sources(timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
