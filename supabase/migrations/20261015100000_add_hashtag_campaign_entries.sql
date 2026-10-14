-- ハッシュタグで募る企画の記録(最初はハロウィン企画「うちの子のベストショット」)。
--
-- つかう人の抽選は「ちがう応募作をいくつ使って投稿したか」で口数が決まる
-- (3作品=1口 / 6作品=2口 / 10作品=3口)。その数を本人に見せ(進捗バー)、
-- 抽選でも同じ計算で数えるための器。2026-10-15 ユーザー決定:
--   - バーの1段 = ちがう応募作1つ。同じ作者でも、投稿が違えば別に数える
--   - 応募作の作者が取り消し・削除しても、ハッシュタグを外しても、数えた分は減らない
--   - 使った人が自分の投稿を取り消すと減る(取り消しと投稿の繰り返しで増やせないように)
--   - 抽選はエントリーした人だけ。エントリー前の投稿もさかのぼって数える
--   - ガチャの応募作も含める(どの番号が出ても、同じ応募作なら1作品)
--
-- 1. hashtag_campaigns            企画のハッシュタグと期間(数え方の正本)
-- 2. hashtag_campaign_submissions 応募作の記録。ハッシュタグが付いた時点で残し、消さない
-- 3. hashtag_campaign_entries     エントリー(抽選の対象)と、お祝いを出した口数

BEGIN;

-- post_hashtags へトリガーを足すときに表ロックを取る。取れないまま待つと、
-- その裏で投稿のタグ保存が行列を作るので、待たずに失敗させて流し直す。
SET LOCAL lock_timeout = '3s';

-- =============================================================================
-- 1. テーブル
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hashtag_campaigns (
  key text PRIMARY KEY,
  -- lib/hashtag.ts の normalizeHashtag() の値(先頭の # なし・NFKC・小文字)
  hashtag_normalized text NOT NULL,
  starts_at timestamptz NOT NULL,
  -- この時刻ちょうどは含まない
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hashtag_campaigns_key_check CHECK (key ~ '^[a-z0-9-]{1,64}$'),
  CONSTRAINT hashtag_campaigns_period_check CHECK (starts_at < ends_at)
);

COMMENT ON TABLE public.hashtag_campaigns IS
  'ハッシュタグで募る企画。応募作の記録(トリガー)と口数の計算が、ここのハッシュタグと期間を読む。';

CREATE TABLE IF NOT EXISTS public.hashtag_campaign_submissions (
  campaign_key text NOT NULL
    REFERENCES public.hashtag_campaigns(key) ON DELETE CASCADE,
  -- FK を張らない。応募作が削除されても記録を残し、使った人の数を減らさないため
  -- (generated_images.source_post_id と同じ考え方)。
  post_id uuid NOT NULL,
  -- 自分の応募作を使った分を数えないために持つ。応募作が消えたあとも比べられる。
  author_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_key, post_id)
);

COMMENT ON TABLE public.hashtag_campaign_submissions IS
  '応募作の記録。期間中に投稿された CREATE の元の作品(派生でない)へ企画のハッシュタグが付いたときにトリガーが残す。消さない。';

CREATE TABLE IF NOT EXISTS public.hashtag_campaign_entries (
  campaign_key text NOT NULL
    REFERENCES public.hashtag_campaigns(key) ON DELETE CASCADE,
  -- CASCADE は必須。退会の削除が FK で止まらないように(post_hashtags と同じ)。
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entered_at timestamptz NOT NULL DEFAULT now(),
  -- お祝い(1口ごとに1回)をどこまで出したか。取り消して減ったあと戻っても、もう一度は出さない
  celebrated_tickets smallint NOT NULL DEFAULT 0,
  CONSTRAINT hashtag_campaign_entries_celebrated_check
    CHECK (celebrated_tickets BETWEEN 0 AND 3),
  PRIMARY KEY (campaign_key, user_id)
);

COMMENT ON TABLE public.hashtag_campaign_entries IS
  '企画へのエントリー。抽選の対象はここにいる人だけ。数えるのはエントリー前の投稿も含む。';

-- =============================================================================
-- 2. 権限(service_role だけ。読み書きはサーバーの RPC を通す)
-- =============================================================================

ALTER TABLE public.hashtag_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_campaign_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_campaign_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hashtag_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hashtag_campaign_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hashtag_campaign_entries FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. ハロウィン企画(10/16(金) 20:00 〜 10/31(土) 23:59)
-- =============================================================================

INSERT INTO public.hashtag_campaigns (key, hashtag_normalized, starts_at, ends_at)
VALUES (
  'halloween-best-shot',
  'うちの子のベストショット',
  '2026-10-16 20:00:00+09',
  '2026-11-01 00:00:00+09'
)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 4. 応募作を記録するトリガー
-- =============================================================================
-- タグの保存(sync_post_hashtags)は INSERT ... ON CONFLICT DO NOTHING なので、
-- 新しく付いたタグの行でだけ発火する。投稿・キャプションの編集のどちらで付いても拾う。
--
-- 拾えないもの: 期間の前にタグ付きで投稿し、取り消して期間中に投稿し直した作品
-- (タグの行が残ったままなので新しい行ができない)。期間前の投稿は対象外なので、
-- 実害が出るのはこの組み合わせだけ。

CREATE OR REPLACE FUNCTION public.record_hashtag_campaign_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 記録に失敗しても、タグの保存(= 投稿の一部)は止めない
  BEGIN
    INSERT INTO public.hashtag_campaign_submissions (campaign_key, post_id, author_id)
    SELECT c.key, gi.id, gi.user_id
    FROM public.hashtags h
    JOIN public.hashtag_campaigns c
      ON c.hashtag_normalized = h.name_normalized
    JOIN public.generated_images gi
      ON gi.id = NEW.post_id
    WHERE h.id = NEW.hashtag_id
      AND now() >= c.starts_at
      AND now() < c.ends_at
      AND gi.is_posted IS TRUE
      AND gi.posted_at >= c.starts_at
      AND gi.posted_at < c.ends_at
      -- CREATE で作った元の作品だけ。派生(人のプロンプトで作った投稿)にタグを付けても応募作にしない
      AND gi.generation_type = 'free'
      AND gi.source_post_id IS NULL
      AND gi.user_id IS NOT NULL
    ON CONFLICT (campaign_key, post_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'record_hashtag_campaign_submission failed: % (%)', SQLERRM, SQLSTATE;
  END;

  RETURN NULL;
END;
$$;

-- トリガーとして動く分には EXECUTE 権限は要らない。RPC としては呼ばせない。
REVOKE ALL ON FUNCTION public.record_hashtag_campaign_submission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_hashtag_campaign_submission ON public.post_hashtags;
CREATE TRIGGER trg_record_hashtag_campaign_submission
  AFTER INSERT ON public.post_hashtags
  FOR EACH ROW
  EXECUTE FUNCTION public.record_hashtag_campaign_submission();

-- 期間が始まってから流した場合に備えて、すでに付いているタグを拾っておく
INSERT INTO public.hashtag_campaign_submissions (campaign_key, post_id, author_id)
SELECT c.key, gi.id, gi.user_id
FROM public.hashtag_campaigns c
JOIN public.hashtags h
  ON h.name_normalized = c.hashtag_normalized
JOIN public.post_hashtags ph
  ON ph.hashtag_id = h.id
JOIN public.generated_images gi
  ON gi.id = ph.post_id
WHERE gi.is_posted IS TRUE
  AND gi.posted_at >= c.starts_at
  AND gi.posted_at < c.ends_at
  AND gi.generation_type = 'free'
  AND gi.source_post_id IS NULL
  AND gi.user_id IS NOT NULL
ON CONFLICT (campaign_key, post_id) DO NOTHING;

-- =============================================================================
-- 5. 本人の進捗(進捗バー)
-- =============================================================================
-- used_works = 期間中に投稿した(今も投稿中の)自分の作品のうち、応募作から作ったものの
-- 応募作の数(同じ応募作は1つ)。自分の応募作は数えない。
-- 応募作は記録(submissions)で見るので、作者が消しても減らない。
-- 自分の投稿は今の状態で見るので、取り消すと減る。
--
-- p_user_id が NULL(未ログイン)なら期間だけ返す。知らない企画なら0行。

CREATE OR REPLACE FUNCTION public.get_hashtag_campaign_progress(
  p_campaign_key text,
  p_user_id uuid
)
RETURNS TABLE (
  starts_at timestamptz,
  ends_at timestamptz,
  used_works integer,
  entered_at timestamptz,
  celebrated_tickets smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.starts_at,
    c.ends_at,
    (
      SELECT count(DISTINCT gi.source_post_id)::integer
      FROM public.generated_images gi
      JOIN public.hashtag_campaign_submissions s
        ON s.campaign_key = c.key
       AND s.post_id = gi.source_post_id
      WHERE p_user_id IS NOT NULL
        AND gi.user_id = p_user_id
        AND gi.is_posted IS TRUE
        AND gi.moderation_status <> 'removed'
        AND gi.posted_at >= c.starts_at
        AND gi.posted_at < c.ends_at
        AND s.author_id <> p_user_id
    ) AS used_works,
    e.entered_at,
    e.celebrated_tickets
  FROM public.hashtag_campaigns c
  LEFT JOIN public.hashtag_campaign_entries e
    ON e.campaign_key = c.key
   AND e.user_id = p_user_id
  WHERE c.key = p_campaign_key;
$$;

REVOKE ALL ON FUNCTION public.get_hashtag_campaign_progress(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hashtag_campaign_progress(text, uuid) TO service_role;

COMMENT ON FUNCTION public.get_hashtag_campaign_progress(text, uuid) IS
  '本人の進捗(使ったちがう応募作の数・エントリー)。抽選の集計も同じ数え方にすること。service_role のみ。';

-- =============================================================================
-- 6. エントリー
-- =============================================================================
-- 受け付けるのは期間の終わりまで(始まる前でも受け付ける)。
-- 戻り値: エントリーした日時。受け付けず未エントリーのままなら NULL。

CREATE OR REPLACE FUNCTION public.enter_hashtag_campaign(
  p_campaign_key text,
  p_user_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ends_at timestamptz;
  v_entered_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.ends_at INTO v_ends_at
  FROM public.hashtag_campaigns c
  WHERE c.key = p_campaign_key;

  IF v_ends_at IS NOT NULL AND now() < v_ends_at THEN
    INSERT INTO public.hashtag_campaign_entries (campaign_key, user_id)
    VALUES (p_campaign_key, p_user_id)
    ON CONFLICT (campaign_key, user_id) DO NOTHING;
  END IF;

  SELECT e.entered_at INTO v_entered_at
  FROM public.hashtag_campaign_entries e
  WHERE e.campaign_key = p_campaign_key
    AND e.user_id = p_user_id;

  RETURN v_entered_at;
END;
$$;

REVOKE ALL ON FUNCTION public.enter_hashtag_campaign(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enter_hashtag_campaign(text, uuid) TO service_role;

COMMENT ON FUNCTION public.enter_hashtag_campaign(text, uuid) IS
  '企画にエントリーする(期間の終わりまで)。すでにエントリー済みならその日時を返す。service_role のみ。';

-- =============================================================================
-- 7. キャンペーン対象の投稿(企画ページの一覧)
-- =============================================================================
-- 応募作の記録のうち、いまも公開中で、いまもハッシュタグが付いている投稿を新しい順に。
-- タグを外した・取り消した投稿は一覧から消える(使った人の数は減らない)。

CREATE OR REPLACE FUNCTION public.list_hashtag_campaign_submissions(
  p_campaign_key text,
  p_limit integer
)
RETURNS TABLE (
  post_id uuid,
  author_id uuid,
  posted_at timestamptz,
  storage_path_thumb text,
  storage_path text,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gi.id,
    gi.user_id,
    gi.posted_at,
    gi.storage_path_thumb,
    gi.storage_path,
    gi.image_url
  FROM public.hashtag_campaigns c
  JOIN public.hashtag_campaign_submissions s
    ON s.campaign_key = c.key
  JOIN public.generated_images gi
    ON gi.id = s.post_id
  WHERE c.key = p_campaign_key
    AND gi.is_posted IS TRUE
    AND gi.moderation_status = 'visible'
    AND gi.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.post_hashtags ph
      JOIN public.hashtags h
        ON h.id = ph.hashtag_id
      WHERE ph.post_id = gi.id
        AND h.name_normalized = c.hashtag_normalized
    )
  ORDER BY gi.posted_at DESC, gi.id DESC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 0), 0), 500);
$$;

REVOKE ALL ON FUNCTION public.list_hashtag_campaign_submissions(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_hashtag_campaign_submissions(text, integer) TO service_role;

COMMENT ON FUNCTION public.list_hashtag_campaign_submissions(text, integer) IS
  '企画ページの「キャンペーン対象の投稿」。公開中でタグが付いたままの応募作を新しい順に。service_role のみ。';

-- 新しい表・RPC を PostgREST のスキーマキャッシュへ反映する
NOTIFY pgrst, 'reload schema';

COMMIT;
