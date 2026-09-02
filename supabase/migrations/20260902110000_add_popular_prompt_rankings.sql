-- ===============================================
-- 🔥人気のプロンプト: 順位テーブルと再計算関数
-- ===============================================
-- 計画書: docs/planning/popular-prompts-tab-implementation-plan.md
--
-- ホームの「オススメ」(sort="week") を置き換える。Free Style の原本だけを対象に、
-- 「他人が何人動いたか」を主軸にしたスコアで並べる。
--
-- なぜ事前計算するか (ADR-001):
--   減衰に now() を使うため、リクエスト時計算だとキャッシュが外れた瞬間に
--   2ページ目が別の順序で計算され、無限スクロールで重複・抜けが出る。
--   pg_cron で全件を確定させ、API は position 順に読むだけにする。
--   候補は 126 件しかないので、事前計算の利点は速度ではなく順序の安定性にある。
--
-- 本マイグレーションはテーブルと関数を作るだけで、cron の登録は別ファイル
-- (20260902110100) で行う。登録も既存方針どおり inactive で投入する。

-- ===============================================
-- 1. 順位テーブル
-- ===============================================
CREATE TABLE IF NOT EXISTS public.popular_prompt_rankings (
  post_id UUID PRIMARY KEY,
  -- 表示の唯一の順序。重複すると並びが不定になるため UNIQUE を張る。
  -- 洗い替えは「全件 DELETE → 1 文で INSERT」なので、途中で重複する瞬間は無い
  -- (DEFERRABLE にする必要がない)。
  position INTEGER NOT NULL CHECK (position >= 1),
  -- ゆらぎを掛ける前の基礎スコア。「なぜこの順位だったか」を後から追うために保存する。
  score NUMERIC NOT NULL,
  -- 新着枠に差し込まれた投稿。UI の 🆕 ラベルはこれを見る。
  is_new BOOLEAN NOT NULL DEFAULT false,
  -- ゆらぎのシードに使った 6 時間バケット。post_id と合わせれば jitter を再現できる。
  bucket BIGINT NOT NULL,
  -- 鮮度判定。cron が止まったら読み出し側が新着順にフォールバックする。
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT popular_prompt_rankings_position_key UNIQUE (position)
);

COMMENT ON TABLE public.popular_prompt_rankings IS
  '🔥人気のプロンプトの確定順位。recompute_popular_prompts() が洗い替える派生データ。service_role のみアクセス可';
COMMENT ON COLUMN public.popular_prompt_rankings.score IS
  'ゆらぎを掛ける前の基礎スコア。表示値は score x jitter(post_id, bucket)';
COMMENT ON COLUMN public.popular_prompt_rankings.bucket IS
  'ゆらぎのシードに使った 6 時間バケット (floor(epoch / 21600))';
COMMENT ON COLUMN public.popular_prompt_rankings.computed_at IS
  '算出時刻。読み出し側はこれが古いとき新着順にフォールバックする';

-- ⭐ SELECT を公開にすると、段階公開中に PostgREST 経由で順位が読めてしまう。
--    公開前の機能の中身が漏れるため、prompt_usage_events と同じく全操作を拒否し、
--    createAdminClient() (service_role) からのみ読む。
ALTER TABLE public.popular_prompt_rankings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.popular_prompt_rankings FROM PUBLIC;
REVOKE ALL ON TABLE public.popular_prompt_rankings FROM anon;
REVOKE ALL ON TABLE public.popular_prompt_rankings FROM authenticated;

DROP POLICY IF EXISTS "popular_prompt_rankings_no_public_access"
  ON public.popular_prompt_rankings;
CREATE POLICY "popular_prompt_rankings_no_public_access"
  ON public.popular_prompt_rankings
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ===============================================
-- 2. 決定的な擬似乱数 r(key) ∈ [0, 1)
-- ===============================================
-- ⭐ bit(32)::int は符号付きなので、::bigint へ広げて 2^31 を足し 2^32 で割る。
--    これを省くとハッシュのおよそ半数で負になり (実測 16 件中 6 件)、
--    r ∈ [-0.5, 0.5] となって jitter が 0.70〜1.00 に偏る (= 常に減点)。
CREATE OR REPLACE FUNCTION public.popular_prompts_hash_unit(p_key TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ((('x' || substr(md5(p_key), 1, 8))::bit(32)::int)::bigint + 2147483648)::numeric
         / 4294967296.0;
$$;

COMMENT ON FUNCTION public.popular_prompts_hash_unit(TEXT) IS
  '決定的な擬似乱数 [0,1)。同じキーなら必ず同じ値を返す (ページネーション整合のため)';

-- ===============================================
-- 3. 半減期 7 日の減衰
-- ===============================================
-- すべて「イベントの発生日時」に適用する (投稿日ではない)。
-- GREATEST(0, ...) は時計のずれで未来日時が入ったとき、重みが 1 を超えないようにする。
CREATE OR REPLACE FUNCTION public.popular_prompts_decay(
  p_at TIMESTAMPTZ,
  p_now TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT power(
    0.5::numeric,
    GREATEST(0::numeric, extract(epoch FROM (p_now - p_at))::numeric) / 86400.0 / 7.0
  );
$$;

COMMENT ON FUNCTION public.popular_prompts_decay(TIMESTAMPTZ, TIMESTAMPTZ) IS
  '半減期 7 日の減衰係数 0.5 ^ (経過日数 / 7)。未来日時は 1.0 で頭打ち';

-- 内部専用。Data API から呼ばれる必要がないので閉じる。
REVOKE ALL ON FUNCTION public.popular_prompts_hash_unit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.popular_prompts_hash_unit(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.popular_prompts_hash_unit(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.popular_prompts_hash_unit(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.popular_prompts_decay(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.popular_prompts_decay(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.popular_prompts_decay(TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.popular_prompts_decay(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ===============================================
-- 4. 再計算関数
-- ===============================================
-- スコア定義の正本は計画書 §5。ここでの実装と食い違ったら計画書を直すこと。
--
--   利用 (本人以外・created_at DESC, id DESC 順)
--     最新1件  → 3.0
--     リピート → 投稿あり 1.0 / 投稿なし 0.25 (追跡不能も投稿なし扱い)
--                ★ 1人あたり合計 3.0 で頭打ち (減衰「後」に適用)
--   コメント  本人以外のユニーク投稿者数 x 1.5 (deleted_at IS NULL、返信も含む)
--   いいね    本人以外 x 1.0
--   閲覧      指標に含めない (ADR-003)
--   減衰      0.5 ^ (経過日 / 7)、各イベントの発生日に適用
--   充実度 k  0.70 + 説明文(0/0.05/0.10/0.15) + Before(0.15)
--   スコア    基礎 x k
CREATE OR REPLACE FUNCTION public.recompute_popular_prompts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- 1 回の実行で 1 つの時刻に固定する。途中で now() が進むと減衰がずれて非決定になる。
  v_now TIMESTAMPTZ := now();
  v_bucket BIGINT;
  v_ranked UUID[];
  v_new UUID[];
  v_post UUID;
  v_pos INTEGER;
  v_len INTEGER;
  v_total INTEGER;
BEGIN
  -- ⭐ auth.uid() では未ログインを弾けない (NULL 同士の比較にならず素通りする)。
  --    service_role かどうかの判定は is_trusted_lineage_writer() に寄せる
  --    (20260831140000_tighten_rpc_anon_allowlist.sql 参照)。
  IF NOT public.is_trusted_lineage_writer() THEN
    RAISE EXCEPTION 'recompute_popular_prompts: 許可されていない経路からの呼び出しです'
      USING ERRCODE = '42501';
  END IF;

  -- ゆらぎのシード。6 時間ごとに変わる。
  v_bucket := floor(extract(epoch FROM v_now) / 21600)::bigint;

  -- 同一トランザクションで 2 回呼ばれても落ちないようにする
  -- (ON COMMIT DROP はコミット時までは残るため)。
  DROP TABLE IF EXISTS pg_temp.tmp_popular_scored;

  CREATE TEMP TABLE tmp_popular_scored ON COMMIT DROP AS
  WITH target AS (
    -- §5-1 対象: Free Style の原本のみ。利用者数による絞り込みは行わない。
    SELECT
      gi.id AS post_id,
      gi.user_id AS author_id,
      gi.posted_at,
      gi.caption,
      gi.show_before_image,
      gi.pre_generation_storage_path
    FROM public.generated_images gi
    WHERE gi.is_posted = true
      AND gi.moderation_status = 'visible'
      AND gi.generation_type = 'free'
      AND gi.source_post_id IS NULL
  ),
  usage_ranked AS (
    -- §5-3 利用。投稿 x 利用者の組ごとに created_at DESC, id DESC で並べる。
    -- ⭐ created_at だけでは同時刻イベントの「最新」が定まらず、実行ごとに
    --    3.0 が付く行が入れ替わりうる。id を最終タイブレークにして固定する。
    SELECT
      e.origin_post_id AS post_id,
      e.user_id,
      e.created_at,
      row_number() OVER (
        PARTITION BY e.origin_post_id, e.user_id
        ORDER BY e.created_at DESC, e.id DESC
      ) AS rn,
      -- 投稿に至ったか。URL 一致ではなく image_job_id の直接結合で判定する。
      -- 引けない場合は EXISTS が false = 投稿なし扱い (安全側)。
      EXISTS (
        SELECT 1
        FROM public.generated_images g
        WHERE g.image_job_id = e.image_job_id
          AND g.is_posted
      ) AS was_posted
    FROM public.prompt_usage_events e
    JOIN target t ON t.post_id = e.origin_post_id
    -- 原作者自身の利用は数えない。イベント側のスナップショットと現在の投稿者の
    -- 両方で弾く (どちらか一方でも本人なら自己利用とみなす)。
    WHERE e.user_id <> e.origin_author_id
      AND e.user_id <> t.author_id
  ),
  usage_per_user AS (
    SELECT
      ur.post_id,
      ur.user_id,
      SUM(
        CASE WHEN ur.rn = 1
          THEN 3.0 * public.popular_prompts_decay(ur.created_at, v_now)
          ELSE 0
        END
      ) AS fresh_score,
      -- ⭐ リピート上限は減衰「後」に適用する。
      --    減衰前に 3.0 で切ると、古いリピートが不当に有利になる。
      LEAST(
        3.0,
        SUM(
          CASE
            WHEN ur.rn = 1 THEN 0
            WHEN ur.was_posted
              THEN 1.0 * public.popular_prompts_decay(ur.created_at, v_now)
            ELSE 0.25 * public.popular_prompts_decay(ur.created_at, v_now)
          END
        )
      ) AS repeat_score
    FROM usage_ranked ur
    GROUP BY ur.post_id, ur.user_id
  ),
  usage_total AS (
    SELECT ur.post_id, SUM(ur.fresh_score + ur.repeat_score) AS usage_score
    FROM usage_per_user ur
    GROUP BY ur.post_id
  ),
  comment_ranked AS (
    -- §5-4 コメント。親コメントと返信を区別せず、1 人 1 票。
    SELECT
      c.image_id AS post_id,
      c.user_id,
      c.created_at,
      row_number() OVER (
        PARTITION BY c.image_id, c.user_id
        ORDER BY c.created_at DESC, c.id DESC
      ) AS rn
    FROM public.comments c
    JOIN target t ON t.post_id = c.image_id
    WHERE c.deleted_at IS NULL
      AND c.user_id <> t.author_id
  ),
  comment_total AS (
    SELECT
      cr.post_id,
      SUM(1.5 * public.popular_prompts_decay(cr.created_at, v_now)) AS comment_score
    FROM comment_ranked cr
    WHERE cr.rn = 1
    GROUP BY cr.post_id
  ),
  like_total AS (
    -- §5-5 いいね。1 投稿 1 ユーザー 1 件は既存の一意制約に従う。
    SELECT
      l.image_id AS post_id,
      SUM(1.0 * public.popular_prompts_decay(l.created_at, v_now)) AS like_score
    FROM public.likes l
    JOIN target t ON t.post_id = l.image_id
    WHERE l.user_id <> t.author_id
    GROUP BY l.image_id
  ),
  scored AS (
    SELECT
      t.post_id,
      t.posted_at,
      (
        COALESCE(u.usage_score, 0)
        + COALESCE(c.comment_score, 0)
        + COALESCE(l.like_score, 0)
      )
      -- §5-6 充実度は加点ではなく 0.70〜1.00 の倍率 (ADR-004)。
      -- 加点にすると、誰にも使われていない投稿が充実度だけで上位に来てしまう。
      * (
          0.70
          + CASE
              WHEN char_length(btrim(COALESCE(t.caption, ''))) >= 100 THEN 0.15
              WHEN char_length(btrim(COALESCE(t.caption, ''))) >= 30  THEN 0.10
              WHEN char_length(btrim(COALESCE(t.caption, ''))) >= 10  THEN 0.05
              ELSE 0
            END
          + CASE
              WHEN t.show_before_image IS TRUE
               AND t.pre_generation_storage_path IS NOT NULL THEN 0.15
              ELSE 0
            END
        ) AS score
    FROM target t
    LEFT JOIN usage_total u ON u.post_id = t.post_id
    LEFT JOIN comment_total c ON c.post_id = t.post_id
    LEFT JOIN like_total l ON l.post_id = t.post_id
  )
  -- §5-8 表示値 = スコア x ゆらぎ (同じ post_id と同じバケットなら必ず同じ値)
  SELECT
    s.post_id,
    s.posted_at,
    s.score,
    s.score * (
      1 + (
        public.popular_prompts_hash_unit(s.post_id::text || ':' || v_bucket::text) * 2 - 1
      ) * 0.15
    ) AS display_score
  FROM scored s;

  -- §5-9 新着枠: 直近 24 時間から posted_at DESC, post_id ASC で上位 3 件。
  -- post_id を入れないと、同時刻投稿のときに採用される 3 件が実行ごとに変わる。
  SELECT COALESCE(
           array_agg(n.post_id ORDER BY n.posted_at DESC, n.post_id ASC),
           '{}'::uuid[]
         )
    INTO v_new
  FROM (
    SELECT post_id, posted_at
    FROM pg_temp.tmp_popular_scored
    WHERE posted_at >= v_now - interval '24 hours'
    ORDER BY posted_at DESC, post_id ASC
    LIMIT 3
  ) n;

  -- 基礎順位。新着枠に採ったものは先に除く (差し込みで二重に並ぶのを防ぐ)。
  -- 並べ替えはすべて決定的にする: 表示値 DESC → posted_at DESC → post_id ASC。
  SELECT COALESCE(
           array_agg(
             s.post_id
             ORDER BY s.display_score DESC, s.posted_at DESC NULLS LAST, s.post_id ASC
           ),
           '{}'::uuid[]
         )
    INTO v_ranked
  FROM pg_temp.tmp_popular_scored s
  WHERE NOT (s.post_id = ANY (v_new));

  -- 採った順に 1 つずつずらして差し込む。位置は 2 + floor(r * 8) = 2〜9 番目。
  FOREACH v_post IN ARRAY v_new LOOP
    v_len := COALESCE(array_length(v_ranked, 1), 0);
    v_pos := 2 + floor(
      public.popular_prompts_hash_unit(
        'newpos:' || v_post::text || ':' || v_bucket::text
      ) * 8
    )::int;
    IF v_pos > v_len THEN
      v_ranked := v_ranked || v_post;
    ELSE
      v_ranked := v_ranked[1:v_pos - 1] || v_post || v_ranked[v_pos:];
    END IF;
  END LOOP;

  -- 洗い替え。全件 DELETE してから 1 文で INSERT するので、
  -- UNIQUE(position) が途中で重複する瞬間は無い。
  DELETE FROM public.popular_prompt_rankings;

  INSERT INTO public.popular_prompt_rankings
    (post_id, position, score, is_new, bucket, computed_at)
  SELECT
    r.post_id,
    r.ord::int,
    s.score,
    r.post_id = ANY (v_new),
    v_bucket,
    v_now
  FROM unnest(v_ranked) WITH ORDINALITY AS r(post_id, ord)
  JOIN pg_temp.tmp_popular_scored s ON s.post_id = r.post_id;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$fn$;

COMMENT ON FUNCTION public.recompute_popular_prompts() IS
  '🔥人気のプロンプトの順位を全件再計算し popular_prompt_rankings を洗い替える。pg_cron から呼ぶ。スコア定義の正本は docs/planning/popular-prompts-tab-implementation-plan.md §5';

-- ⭐ Supabase は public スキーマの関数に anon / authenticated への EXECUTE を
--    既定で自動付与する (= CREATE した瞬間に穴が空く)。必ず剥がす。
REVOKE ALL ON FUNCTION public.recompute_popular_prompts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_popular_prompts() FROM anon;
REVOKE ALL ON FUNCTION public.recompute_popular_prompts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_popular_prompts() TO service_role;

-- ===============================================
-- DOWN:
-- DROP FUNCTION IF EXISTS public.recompute_popular_prompts();
-- DROP FUNCTION IF EXISTS public.popular_prompts_decay(TIMESTAMPTZ, TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS public.popular_prompts_hash_unit(TEXT);
-- DROP TABLE IF EXISTS public.popular_prompt_rankings;
-- ===============================================
