-- 🔥人気のプロンプト: 新着枠の差し込み位置を層化抽出にして、🆕 が固まらないようにする。
--
-- 背景: 20260916100000 で 7 件に増やしたところ、3 つ以上が連続して並ぶことがあった。
-- 投稿ごとに独立してハッシュで位置を引いているため、偏りがそのまま出ていた。
-- 実測(20万回試行)で 3 連続以上が 53%。
--
-- 2〜20 位を件数ぶんの区画に割り、各区画から 1 つずつ選ぶようにする。
-- 1 区画に 2 つ入らないので 3 連続は起きない(実測 0.0%)。2 連続は 65% 残るので
-- 位置は固定にならない。
--
-- スコアの定義・新着枠の件数(7 件)・対象条件は変更しない。

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
  v_new_count INTEGER;
  -- 新着枠を散らす範囲(最終順位)。2〜20 位。
  v_new_lo CONSTANT INTEGER := 2;
  v_new_hi CONSTANT INTEGER := 20;
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

  -- §5-9 新着枠: 直近 24 時間から posted_at DESC, post_id ASC で上位 7 件。
  -- post_id を入れないと、同時刻投稿のときに採用される件数分が実行ごとに変わる。
  --
  -- ⭐ 3 件だった頃、「直近 24 時間」の窓は**一度も効いていなかった**。
  --    対象投稿が 1 日 6〜13 件あるため 3 件枠がすぐ押し出され、実測で
  --    🆕 が付く時間は平均 9.5 時間・丸 24 時間付いた投稿は 30 日間で 0 件。
  --    上限を決めていたのは常にこの LIMIT の方だった。
  --    7 件にすると平均 20.0 時間、214 件中 83 件が丸 24 時間になる。
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
    LIMIT 7
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

  -- §5-10 差し込み。2〜20 位を新着の件数ぶんの「区画」に割り、
  -- **各区画から 1 つずつ**位置を選ぶ(層化抽出)。
  --
  -- ⭐ 投稿ごとに独立してハッシュを引くと**固まる**。実測(20万回試行)で
  --    🆕 が 3 つ以上連続する確率は 53% あった(2〜14 に 7 件のとき)。
  --    区画を割ってから引けば 1 区画に 2 つ入らないので 3 連続は起きない
  --    (同じ試行で 0.0%)。2 連続は 65% 残る = 位置は毎回変わる。固定ではない。
  --
  -- ⭐ **位置の昇順に挿入すること。** 差し込みは 1 件ずつ配列をずらすので、
  --    投稿日時順のまま入れると後のものが先のものを押し下げ、せっかく割った
  --    区画をはみ出す(実測: 上位20に 7.00 件 → 6.1 件・3 連続が 5% 復活)。
  --
  -- ⭐ どの投稿がどの区画に入るかも `newslot:` のハッシュで決める。配列順
  --    (posted_at DESC)のまま割ると「最新の投稿は必ず 2〜4 位」になってしまう。
  --
  -- ⭐ 件数が 7 未満の日も同じ式で 2〜20 位に散る(区画の幅が広がるだけ)。
  v_new_count := COALESCE(array_length(v_new, 1), 0);

  IF v_new_count > 0 THEN
    FOR v_post, v_pos IN
      SELECT q.post_id, q.pos
      FROM (
        SELECT
          p.post_id,
          (
            p.lo
            + floor(
                public.popular_prompts_hash_unit(
                  'newpos:' || p.post_id::text || ':' || v_bucket::text
                ) * GREATEST(p.hi - p.lo + 1, 1)
              )
          )::int AS pos
        FROM (
          SELECT
            s.post_id,
            (
              v_new_lo
              + floor(
                  s.stratum * (v_new_hi - v_new_lo + 1)::numeric / v_new_count
                )
            )::int AS lo,
            (
              v_new_lo
              + floor(
                  (s.stratum + 1) * (v_new_hi - v_new_lo + 1)::numeric / v_new_count
                )
              - 1
            )::int AS hi
          FROM (
            SELECT
              n.post_id,
              row_number() OVER (
                ORDER BY
                  public.popular_prompts_hash_unit(
                    'newslot:' || n.post_id::text || ':' || v_bucket::text
                  ),
                  n.post_id
              ) - 1 AS stratum
            FROM unnest(v_new) AS n(post_id)
          ) s
        ) p
      ) q
      ORDER BY q.pos ASC, q.post_id ASC
    LOOP
      v_len := COALESCE(array_length(v_ranked, 1), 0);
      IF v_pos > v_len THEN
        v_ranked := v_ranked || v_post;
      ELSE
        v_ranked := v_ranked[1:v_pos - 1] || v_post || v_ranked[v_pos:];
      END IF;
    END LOOP;
  END IF;

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

-- ⭐ CREATE OR REPLACE では権限は保たれるが、シグネチャを変えたときに
--    黙って PUBLIC へ戻るのが既知の事故なので、毎回明示的に張り直す。
REVOKE ALL ON FUNCTION public.recompute_popular_prompts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_popular_prompts() FROM anon;
REVOKE ALL ON FUNCTION public.recompute_popular_prompts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_popular_prompts() TO service_role;

-- ===============================================
-- DOWN: 20260916100000 の定義へ戻す (投稿ごとに独立ハッシュ・2〜14 位)
-- ===============================================
