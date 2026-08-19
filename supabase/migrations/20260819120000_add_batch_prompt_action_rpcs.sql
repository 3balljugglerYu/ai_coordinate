-- ===============================================
-- 一覧（フィード）用に、原作の判定と利用数をまとめて引けるようにする
-- ===============================================
-- `/api/posts/prompt-actions` は1リクエストで最大50件の投稿を解決するが、
-- そのうち `validate_derived_prompt_source` と `get_prompt_usage_count` は
-- **原作ごとに1往復**していた。原作が45件あれば、それだけで90往復になる。
--
-- 内訳（バッチ50件・原作O件あたり）:
--   固定 4 往復（投稿・原作行・プロフィール・style_presets）+ 2 × O
--
-- フィードは未ログインでも開ける公開導線で、スクロール復元では一度に
-- 2バッチ走る。直近で Disk IO バジェット枯渇の障害も起きているため、
-- ここは削っておく。
--
-- ## 判定を書き写さない
--
-- 両関数とも**既存の関数を LATERAL で呼ぶだけ**のラッパーにする。条件を
-- SQL へ写して二重管理にすると、一覧と詳細で可否が食い違い「一覧には出る
-- のに詳細では作れない」（あるいはその逆）が生まれる。正本は1つに保つ。
--
-- 単体版は詳細画面がそのまま使い続けるので、削除も変更もしない。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. 原作の可否をまとめて判定する
-- ===============================================
-- 入力は (原作ID, requester) の**組の配列**にする。原作 ID だけでは足りない。
-- 派生投稿は原作者をスナップショット (`source_author_id`) で持つため、
-- 同じ原作でもレコードによって requester が変わり得る。
--
-- 2つの配列は同じ長さで渡すこと。長さが違うと unnest が短いほうを NULL で
-- 埋め、単体版が NULL を「利用不可」として返す（fail closed なので秘匿は
-- 緩まないが、CTA が黙って消える）。呼び出し側の取り違えを検出できるよう、
-- ここで明示的に弾く。
--
-- 戻り値には入力の組をそのまま含める。呼び出し側が結果を突き合わせる
-- キーになり、行の順序に依存せずに済む。

CREATE OR REPLACE FUNCTION public.validate_derived_prompt_sources(
  p_source_post_ids uuid[],
  p_requester_ids uuid[]
)
RETURNS TABLE (
  source_post_id uuid,
  requester_id uuid,
  is_available boolean,
  root_post_id uuid,
  origin_author_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_source_post_ids IS NULL OR p_requester_ids IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_source_post_ids, 1) IS DISTINCT FROM
     array_length(p_requester_ids, 1) THEN
    RAISE EXCEPTION
      '原作IDと requester の配列長が一致しない (% と %)',
      array_length(p_source_post_ids, 1),
      array_length(p_requester_ids, 1);
  END IF;

  RETURN QUERY
  SELECT
    pair.source_post_id,
    pair.requester_id,
    v.is_available,
    v.root_post_id,
    v.origin_author_id
  FROM unnest(p_source_post_ids, p_requester_ids)
       AS pair(source_post_id, requester_id)
  CROSS JOIN LATERAL public.validate_derived_prompt_source(
    pair.source_post_id,
    pair.requester_id
  ) AS v;
END;
$function$;

COMMENT ON FUNCTION public.validate_derived_prompt_sources(uuid[], uuid[]) IS
  '一覧用。validate_derived_prompt_source を組ごとに呼ぶだけのラッパー。判定の正本は単体版';

-- ===============================================
-- 2. 利用数をまとめて数える
-- ===============================================
-- 単体版と同じ条件（原作者自身の生成は数えない）を GROUP BY で一度に出す。
-- 利用が0件の原作は行が返らない。呼び出し側が0を既定にすること
-- （行を作るために左結合を足すと、入力の重複除去まで持ち込むことになる）。

CREATE OR REPLACE FUNCTION public.get_prompt_usage_counts(
  p_origin_post_ids uuid[]
)
RETURNS TABLE (
  origin_post_id uuid,
  usage_count integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT
    e.origin_post_id,
    count(DISTINCT e.user_id)::integer AS usage_count
  FROM public.prompt_usage_events AS e
  WHERE e.origin_post_id = ANY(p_origin_post_ids)
    -- 原作者自身の生成は数えない（単体版と同じ条件）
    AND e.user_id <> e.origin_author_id
  GROUP BY e.origin_post_id;
$function$;

COMMENT ON FUNCTION public.get_prompt_usage_counts(uuid[]) IS
  '一覧用。原作ごとのユニーク利用者数をまとめて返す。原作者自身は除外。利用0の原作は行を返さない。service-only';

-- ===============================================
-- 3. EXECUTE 権限
-- ===============================================
-- 単体版と同じく service_role だけ。任意 UUID での列挙を防ぐ。

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'validate_derived_prompt_sources(uuid[], uuid[])',
      'get_prompt_usage_counts(uuid[])'
    ]) AS sig
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', r.sig);
  END LOOP;
END;
$$;

-- ===============================================
-- 4. 適用後の検証
-- ===============================================
-- ラッパーが単体版と同じ答えを返すことを、実データで確かめる。
-- ここが食い違うと一覧と詳細で CTA の可否がずれる。

DO $$
DECLARE
  v_post uuid;
  v_author uuid;
  v_single boolean;
  v_batch boolean;
  v_count integer;
BEGIN
  -- 実在しない原作は利用不可
  SELECT is_available INTO v_batch
  FROM public.validate_derived_prompt_sources(
    ARRAY['00000000-0000-4000-8000-000000000000'::uuid],
    ARRAY['00000000-0000-4000-8000-000000000001'::uuid]
  );

  IF v_batch IS NOT FALSE THEN
    RAISE EXCEPTION '存在しない原作がバッチ版で利用可能と判定された';
  END IF;

  -- 空配列は0行（エラーにしない）
  PERFORM public.validate_derived_prompt_sources(
    ARRAY[]::uuid[], ARRAY[]::uuid[]
  );
  PERFORM public.get_prompt_usage_counts(ARRAY[]::uuid[]);

  -- 実在する free root 投稿で、単体版とバッチ版の答えを突き合わせる
  SELECT id, user_id INTO v_post, v_author
  FROM public.generated_images
  WHERE generation_type = 'free'
    AND is_posted = true
    AND moderation_status = 'visible'
    AND source_post_id IS NULL
  LIMIT 1;

  IF v_post IS NOT NULL THEN
    SELECT is_available INTO v_single
    FROM public.validate_derived_prompt_source(v_post, v_author);

    SELECT is_available INTO v_batch
    FROM public.validate_derived_prompt_sources(
      ARRAY[v_post], ARRAY[v_author]
    );

    IF v_single IS DISTINCT FROM v_batch THEN
      RAISE EXCEPTION
        '原作 % の判定が単体版(%)とバッチ版(%)で食い違う', v_post, v_single, v_batch;
    END IF;

    SELECT COALESCE(usage_count, 0) INTO v_count
    FROM public.get_prompt_usage_counts(ARRAY[v_post]);

    IF COALESCE(v_count, 0)
       IS DISTINCT FROM public.get_prompt_usage_count(v_post) THEN
      RAISE EXCEPTION '原作 % の利用数が単体版とバッチ版で食い違う', v_post;
    END IF;
  END IF;

  RAISE NOTICE '一覧用のバッチ RPC を追加した';
END;
$$;

COMMIT;
