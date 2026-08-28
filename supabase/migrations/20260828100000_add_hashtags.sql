-- 投稿キャプションのハッシュタグを保存する器（Phase 2）。
--
-- 目的は「説明欄の #タグ から作品を探せるようにする」こと。抽出規則そのものは
-- TypeScript の lib/hashtag.ts が正本で、この migration は保存と可視性だけを担う。
-- 詳細は docs/planning/hashtag-search-implementation-plan.md
--
-- MVP はユーザーが書いたタグのみ。将来の自動タグ付け（スタイル由来・画像 AI 由来）は
-- post_hashtags.source で同じ器に入れられるようにしてある。

BEGIN;

-- 外部キーを足すとき、参照先の generated_images に SHARE ROW EXCLUSIVE ロックを取る。
-- 新表は空なので検証スキャンは無く一瞬で終わるが、万一ロックが取れないときに
-- 待ち続けると、その裏で投稿・生成の書き込みが行列を作る。
-- 待たずに失敗させ、空いている時間に流し直せるようにする。
SET LOCAL lock_timeout = '3s';

-- =============================================================================
-- 1. テーブル
-- =============================================================================

-- 名寄せ用。表記は原文のまま残し、同一視は name_normalized で行う。
-- 例: 「#AI」と「#ai」は別の name、同じ name_normalized。
CREATE TABLE IF NOT EXISTS public.hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hashtags_name_normalized_unique UNIQUE (name_normalized),
  -- 上限は lib/hashtag.ts の HASHTAG_MAX_LENGTH と同じ 50 文字。
  -- NFKC で伸びる文字（㍿ → 株式会社）があるため正規化後は少し余裕を持たせる。
  CONSTRAINT hashtags_name_length_check
    CHECK (char_length(name) BETWEEN 1 AND 50),
  CONSTRAINT hashtags_name_normalized_length_check
    CHECK (char_length(name_normalized) BETWEEN 1 AND 100)
);

COMMENT ON TABLE public.hashtags IS
  'ハッシュタグの名寄せ表。name は初出の表記（表示用）、name_normalized（NFKC+小文字）が同一視キー。';
COMMENT ON COLUMN public.hashtags.name_normalized IS
  'lib/hashtag.ts の normalizeHashtag() が作る値。SQL 側では作らない（JS と PG で lower() の結果が食い違う言語があるため）。';

CREATE TABLE IF NOT EXISTS public.post_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ⚠️ ON DELETE CASCADE は必須。generated_images.user_id は auth.users(id) を
  -- CASCADE で参照しているため、ここを無指定(NO ACTION)にすると
  -- タグ付き投稿の物理削除と退会 purge が FK 違反で止まる。
  post_id uuid NOT NULL REFERENCES public.generated_images(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  -- 由来。MVP は 'user' のみ。将来の自動タグ付けを同じ器に入れるための列。
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_hashtags_source_check
    CHECK (source = ANY (ARRAY['user'::text, 'style'::text, 'ai'::text])),
  -- source を含めるのは、同じタグが「ユーザーが書いた」と「自動で付いた」の
  -- 両方で成立しうるため。洗い替えも source 単位で行う。
  CONSTRAINT post_hashtags_post_tag_source_unique UNIQUE (post_id, hashtag_id, source)
);

COMMENT ON TABLE public.post_hashtags IS
  '投稿とハッシュタグの関連。書き込みは sync_post_hashtags RPC(service_role)のみ。';

-- タグ → 投稿の逆引き（タグ検索の主経路）。
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_post
  ON public.post_hashtags (hashtag_id, post_id);

-- 投稿 → タグ（キャプション表示・洗い替え）は
-- post_hashtags_post_tag_source_unique の先頭列で足りる。

-- =============================================================================
-- 2. RLS
-- =============================================================================

ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hashtags_select_all" ON public.hashtags;
CREATE POLICY "hashtags_select_all"
  ON public.hashtags
  FOR SELECT
  USING (true);

ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;

-- ⚠️ 無条件公開にしない。取消・公開停止した投稿でも「どのタグが付いていたか」を
-- Data API から列挙できてしまうため、いま公開中の投稿の行だけ見えるようにする。
DROP POLICY IF EXISTS "post_hashtags_select_visible" ON public.post_hashtags;
CREATE POLICY "post_hashtags_select_visible"
  ON public.post_hashtags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.generated_images g
      WHERE g.id = post_hashtags.post_id
        AND g.is_posted IS TRUE
        AND g.moderation_status = 'visible'
    )
  );

-- INSERT/UPDATE/DELETE のポリシーは作らない。書き込みは SECURITY DEFINER の
-- RPC（service_role 限定）だけを通す。

-- =============================================================================
-- 3. 同期 RPC
-- =============================================================================
-- 投稿・編集・完走フィード投稿の 3 経路が、キャプションから抽出した結果を渡して呼ぶ。
--
-- 引数 p_tags は lib/hashtag.ts の extractHashtags() の戻り値そのままの JSON 配列:
--   [{"name": "AI", "normalized": "ai"}, ...]
--
-- 計画書では p_tags text[]（表示名の配列）としていたが jsonb に変える。
-- 表示名だけ渡すと正規化キーを SQL 側で作ることになり、JS の toLowerCase と
-- PostgreSQL の lower() が食い違う言語（トルコ語の İ、ギリシャ語の語末シグマ）で
-- 保存キーと検索キーがズレて「タグを押しても出てこない」が起きる。
-- 正規化も TypeScript を正本にするという ADR-002 の意図をそのまま通す。
--
-- 戻り値: 同期したタグ数。キャプションが一致せず何もしなかった場合は -1。

CREATE OR REPLACE FUNCTION public.sync_post_hashtags(
  p_post_id uuid,
  p_tags jsonb,
  p_expected_caption text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caption text;
  v_tags jsonb;
  v_tag record;
  v_hashtag_id uuid;
  v_hashtag_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_post_id IS NULL THEN
    RETURN -1;
  END IF;

  v_tags := coalesce(p_tags, '[]'::jsonb);

  IF jsonb_typeof(v_tags) <> 'array' THEN
    RAISE EXCEPTION 'sync_post_hashtags: p_tags must be a json array';
  END IF;

  -- 上限は lib/hashtag.ts と同じ。呼び出し側が守る前提だが、器の側でも閉じておく。
  IF jsonb_array_length(v_tags) > 10 THEN
    RAISE EXCEPTION 'sync_post_hashtags: too many tags (%)', jsonb_array_length(v_tags);
  END IF;

  -- 行ロックしてから世代照合する。
  -- キャプション更新とタグ同期は別トランザクションなので、編集 A→B の直後に
  -- 遅れて届いた A の同期要求を通すと、本文 B にタグ A が付く。
  SELECT gi.caption INTO v_caption
  FROM public.generated_images gi
  WHERE gi.id = p_post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  IF coalesce(v_caption, '') IS DISTINCT FROM coalesce(p_expected_caption, '') THEN
    RETURN -1;
  END IF;

  -- 名寄せ。既出タグの表示名は初出の表記のまま残す（上書きしない）。
  FOR v_tag IN
    -- ordinality を選択リストに残すのは DISTINCT ON + ORDER BY の制約のため。
    SELECT DISTINCT ON (normalized) name, normalized, ordinality
    FROM (
      SELECT
        e->>'name' AS name,
        e->>'normalized' AS normalized,
        ordinality
      FROM jsonb_array_elements(v_tags) WITH ORDINALITY AS t(e, ordinality)
    ) s
    WHERE s.name IS NOT NULL
      AND s.normalized IS NOT NULL
      AND char_length(s.name) BETWEEN 1 AND 50
      AND char_length(s.normalized) BETWEEN 1 AND 100
    ORDER BY normalized, ordinality
  LOOP
    INSERT INTO public.hashtags (name, name_normalized)
    VALUES (v_tag.name, v_tag.normalized)
    ON CONFLICT (name_normalized)
      DO UPDATE SET name = public.hashtags.name
    RETURNING id INTO v_hashtag_id;

    v_hashtag_ids := array_append(v_hashtag_ids, v_hashtag_id);
  END LOOP;

  -- 洗い替えは source='user' の行だけ。将来 style/ai 由来を足したときに
  -- ユーザータグの再同期が他 source の行を消さないようにする。
  DELETE FROM public.post_hashtags
  WHERE post_id = p_post_id
    AND source = 'user'
    AND NOT (hashtag_id = ANY (v_hashtag_ids));

  INSERT INTO public.post_hashtags (post_id, hashtag_id, source)
  SELECT p_post_id, hashtag_id, 'user'
  FROM unnest(v_hashtag_ids) AS hashtag_id
  ON CONFLICT (post_id, hashtag_id, source) DO NOTHING;

  RETURN coalesce(array_length(v_hashtag_ids, 1), 0);
END;
$$;

-- ⚠️ PostgreSQL は新規関数の EXECUTE を PUBLIC に既定付与する。
-- GRANT だけでは閉じない（20260818120000 と同じ作法）。
REVOKE ALL ON FUNCTION public.sync_post_hashtags(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_post_hashtags(uuid, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.sync_post_hashtags(uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_post_hashtags(uuid, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.sync_post_hashtags(uuid, jsonb, text) IS
  'キャプションから抽出したタグで post_hashtags(source=user)を洗い替える。キャプション不一致なら何もせず -1 を返す。呼び出しは service_role のみ。';

-- 新規テーブル・RPC を PostgREST のスキーマキャッシュへ明示反映する。
-- event trigger 任せだと反映前の呼び出しが PGRST202 で静かに落ちる
-- （タグ同期は非致命なので投稿は成功し、タグだけ付かない状態に気づきにくい）。
NOTIFY pgrst, 'reload schema';

COMMIT;
