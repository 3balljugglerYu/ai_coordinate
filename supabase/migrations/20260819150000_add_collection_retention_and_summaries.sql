-- 企画レポート用の集計 RPC を2つ足す。
--
-- どちらも「参加者リストを跨いだ集計」で、行を取得して JS で数える現行方式だと
-- 取得行数が読めない。docs/architecture/data.ja.md の方針(重い処理は SQL へ)に沿って
-- RPC に寄せる。既存の指標は現行方式のまま触らない(純関数のテストを失わないため)。
--
-- 1) get_collection_retention_cohort   : 会期終了後にまた生成したか(Phase 4)
-- 2) get_collection_campaign_summaries : 企画の横並び比較(Phase 6)
--
-- 運営除外は呼び出し側から uuid[] で渡す。env(ADMIN_USER_IDS / ADMIN_PREVIEW_USER_IDS)と
-- DB(admin_users)の和集合はアプリ側でしか作れないため、DB 側で解決しない。
-- `user_id IS NULL` の行(ゲスト)を落とさないよう、比較は必ず NULL を明示的に扱う。

BEGIN;

-- =====================================================================
-- 1) 会期終了後の継続
-- =====================================================================
--
-- 企画の価値判断の本丸。ファッション雑誌企画の手集計では
--   生成到達者 29名中11名(37.9%) / 完走者 19名中8名(42.1%) / 期間中の新規登録 18名中0名
-- で、「完走者は残るが、企画で入った新規は1人も戻っていない」が見えた。
-- この形の数字は今のダッシュボードに一切無い。
--
-- 「戻ってきた」の定義は **会期終了後に成功した生成が1件でもあること**。
-- 投稿やログインではなく生成にしているのは、本サービスの中心行動であり、
-- image_jobs が最も取りこぼしの少ない記録だから。
CREATE OR REPLACE FUNCTION public.get_collection_retention_cohort(
  p_category_key text,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  generator_uu integer,
  generator_returned integer,
  completer_uu integer,
  completer_returned integer,
  registered_uu integer,
  registered_returned integer,
  observed_until timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
  WITH excluded AS (
    SELECT coalesce(p_exclude_user_ids, '{}'::uuid[]) AS ids
  ),
  -- 会期中にこの企画で生成した人
  generators AS (
    SELECT DISTINCT j.user_id
    FROM image_jobs j, excluded e
    WHERE j.style_preset_category_key = p_category_key
      AND j.status = 'succeeded'
      AND j.created_at >= p_start
      AND j.created_at <= p_end
      AND j.user_id IS NOT NULL
      AND j.user_id <> ALL (e.ids)
  ),
  -- 会期中に完走した人
  completers AS (
    SELECT DISTINCT c.user_id
    FROM collection_completions c, excluded e
    WHERE c.category_key = p_category_key
      AND c.mount_status = 'completed'
      AND c.completed_at >= p_start
      AND c.completed_at <= p_end
      AND c.user_id IS NOT NULL
      AND c.user_id <> ALL (e.ids)
  ),
  -- 会期中に登録した人(企画経由かは問わない。signup_source は別途)
  registered AS (
    SELECT DISTINCT p.user_id
    FROM profiles p, excluded e
    WHERE p.created_at >= p_start
      AND p.created_at <= p_end
      AND p.user_id IS NOT NULL
      AND p.user_id <> ALL (e.ids)
  ),
  -- 会期終了後に「何かしら」生成した人(企画は問わない)
  returned AS (
    SELECT DISTINCT j.user_id
    FROM image_jobs j, excluded e
    WHERE j.status = 'succeeded'
      AND j.created_at > p_end
      AND j.user_id IS NOT NULL
      AND j.user_id <> ALL (e.ids)
  )
  SELECT
    (SELECT count(*) FROM generators)::integer,
    (SELECT count(*) FROM generators g WHERE g.user_id IN (SELECT user_id FROM returned))::integer,
    (SELECT count(*) FROM completers)::integer,
    (SELECT count(*) FROM completers c WHERE c.user_id IN (SELECT user_id FROM returned))::integer,
    (SELECT count(*) FROM registered)::integer,
    (SELECT count(*) FROM registered r WHERE r.user_id IN (SELECT user_id FROM returned))::integer,
    now();
$function$;

COMMENT ON FUNCTION public.get_collection_retention_cohort(text, timestamptz, timestamptz, uuid[]) IS
  '企画の会期終了後にまた生成したユーザーの割合を、生成到達者 / 完走者 / 会期中の新規登録者の3コホートで返す。admin 専用(service_role)。';

REVOKE ALL ON FUNCTION public.get_collection_retention_cohort(text, timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_collection_retention_cohort(text, timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_collection_retention_cohort(text, timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_retention_cohort(text, timestamptz, timestamptz, uuid[]) TO service_role;

-- =====================================================================
-- 2) 企画の横並び比較
-- =====================================================================
--
-- 今は1企画ずつしか見られず、「8ページは長すぎたか」に答えられない。
-- 手集計では完走率がページ数と逆相関していた(6ページ企画 80.0% / 94.4% に対し
-- 8〜9ページ企画 64.5% / 75.0%)。次回の会期とページ数を決める材料になる。
--
-- **会期ではなくカテゴリ単位の通算**で返す。企画ごとに会期の定義が揺れており
-- (神コレは表示期間より前から生成が始まっている)、会期で切ると比較にならない。
CREATE OR REPLACE FUNCTION public.get_collection_campaign_summaries(
  p_exclude_user_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  category_key text,
  display_name text,
  page_count integer,
  display_starts_at timestamptz,
  display_ends_at timestamptz,
  generations integer,
  generator_uu integer,
  completer_uu integer,
  share_uu integer,
  first_generation_at timestamptz,
  last_generation_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $function$
  WITH excluded AS (
    SELECT coalesce(p_exclude_user_ids, '{}'::uuid[]) AS ids
  ),
  -- admin の企画一覧と同じ条件(コレクションシリーズ + 前提付き報酬コレクション)
  cats AS (
    SELECT c.id, c.key, c.display_name_ja,
           c.collection_display_starts_at, c.collection_display_ends_at
    FROM preset_categories c
    WHERE c.is_collection_series = true
       OR c.unlock_prerequisite_key IS NOT NULL
  )
  SELECT
    cats.key,
    cats.display_name_ja,
    (SELECT count(*) FROM style_presets p WHERE p.category_id = cats.id)::integer,
    cats.collection_display_starts_at,
    cats.collection_display_ends_at,
    (SELECT count(*) FROM image_jobs j, excluded e
       WHERE j.style_preset_category_key = cats.key AND j.status = 'succeeded'
         AND (j.user_id IS NULL OR j.user_id <> ALL (e.ids)))::integer,
    (SELECT count(DISTINCT j.user_id) FROM image_jobs j, excluded e
       WHERE j.style_preset_category_key = cats.key AND j.status = 'succeeded'
         AND j.user_id IS NOT NULL AND j.user_id <> ALL (e.ids))::integer,
    (SELECT count(DISTINCT c2.user_id) FROM collection_completions c2, excluded e
       WHERE c2.category_key = cats.key AND c2.mount_status = 'completed'
         AND c2.user_id IS NOT NULL AND c2.user_id <> ALL (e.ids))::integer,
    (SELECT count(DISTINCT ev.user_id) FROM style_usage_events ev, excluded e
       WHERE ev.event_type = 'mount_shared' AND ev.style_id = cats.key
         AND ev.user_id IS NOT NULL AND ev.user_id <> ALL (e.ids))::integer,
    (SELECT min(j.created_at) FROM image_jobs j
       WHERE j.style_preset_category_key = cats.key AND j.status = 'succeeded'),
    (SELECT max(j.created_at) FROM image_jobs j
       WHERE j.style_preset_category_key = cats.key AND j.status = 'succeeded')
  FROM cats
  ORDER BY (SELECT min(j.created_at) FROM image_jobs j
              WHERE j.style_preset_category_key = cats.key AND j.status = 'succeeded')
           NULLS LAST;
$function$;

COMMENT ON FUNCTION public.get_collection_campaign_summaries(uuid[]) IS
  'コレクション企画をカテゴリ単位の通算で並べて返す(横並び比較用)。会期ではなく通算なのは企画ごとに会期の定義が揺れるため。admin 専用(service_role)。';

REVOKE ALL ON FUNCTION public.get_collection_campaign_summaries(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_collection_campaign_summaries(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_collection_campaign_summaries(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_campaign_summaries(uuid[]) TO service_role;

-- =====================================================================
-- 検証: 実データで単体集計と突き合わせる
-- =====================================================================
--
-- 前回(20260819120000)は、古い関数定義を写したことで利用数が単体版と食い違い、
-- この形の検証ブロックが止めてくれた。同じ事故を防ぐため必ず入れる。
-- 「関数が動く」ではなく「単体で数えた値と一致する」を確かめる。
DO $$
DECLARE
  v_cat record;
  v_row record;
  v_expected_gen integer;
  v_expected_comp integer;
  v_checked integer := 0;
BEGIN
  FOR v_cat IN
    SELECT c.key, c.collection_display_starts_at AS cs, c.collection_display_ends_at AS ce
    FROM preset_categories c
    WHERE (c.is_collection_series = true OR c.unlock_prerequisite_key IS NOT NULL)
      AND c.collection_display_starts_at IS NOT NULL
      AND c.collection_display_ends_at IS NOT NULL
  LOOP
    -- 継続コホートの母数が、単体で数えた値と一致するか
    SELECT count(DISTINCT j.user_id) INTO v_expected_gen
    FROM image_jobs j
    WHERE j.style_preset_category_key = v_cat.key
      AND j.status = 'succeeded'
      AND j.created_at >= v_cat.cs AND j.created_at <= v_cat.ce
      AND j.user_id IS NOT NULL;

    SELECT count(DISTINCT c2.user_id) INTO v_expected_comp
    FROM collection_completions c2
    WHERE c2.category_key = v_cat.key
      AND c2.mount_status = 'completed'
      AND c2.completed_at >= v_cat.cs AND c2.completed_at <= v_cat.ce;

    SELECT * INTO v_row
    FROM public.get_collection_retention_cohort(v_cat.key, v_cat.cs, v_cat.ce, '{}'::uuid[]);

    IF v_row.generator_uu IS DISTINCT FROM v_expected_gen THEN
      RAISE EXCEPTION '継続コホートの生成UUが単体集計と食い違う (% : RPC=% 単体=%)',
        v_cat.key, v_row.generator_uu, v_expected_gen;
    END IF;
    IF v_row.completer_uu IS DISTINCT FROM v_expected_comp THEN
      RAISE EXCEPTION '継続コホートの完走UUが単体集計と食い違う (% : RPC=% 単体=%)',
        v_cat.key, v_row.completer_uu, v_expected_comp;
    END IF;
    -- 戻ってきた人数は母数を超えられない
    IF v_row.generator_returned > v_row.generator_uu
       OR v_row.completer_returned > v_row.completer_uu
       OR v_row.registered_returned > v_row.registered_uu THEN
      RAISE EXCEPTION '継続コホートで再訪数が母数を超えている (%)', v_cat.key;
    END IF;

    v_checked := v_checked + 1;
  END LOOP;

  IF v_checked = 0 THEN
    RAISE EXCEPTION '検証対象の企画が1件も無い(表示期間が設定された企画が存在しない)';
  END IF;
  RAISE NOTICE '継続コホート: % 企画で単体集計と一致', v_checked;
END;
$$;

DO $$
DECLARE
  v_row record;
  v_expected_gen integer;
  v_expected_comp integer;
  v_checked integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.get_collection_campaign_summaries('{}'::uuid[])
  LOOP
    SELECT count(*) INTO v_expected_gen
    FROM image_jobs j
    WHERE j.style_preset_category_key = v_row.category_key AND j.status = 'succeeded';

    SELECT count(DISTINCT c2.user_id) INTO v_expected_comp
    FROM collection_completions c2
    WHERE c2.category_key = v_row.category_key AND c2.mount_status = 'completed';

    IF v_row.generations IS DISTINCT FROM v_expected_gen THEN
      RAISE EXCEPTION '横並び比較の生成数が単体集計と食い違う (% : RPC=% 単体=%)',
        v_row.category_key, v_row.generations, v_expected_gen;
    END IF;
    IF v_row.completer_uu IS DISTINCT FROM v_expected_comp THEN
      RAISE EXCEPTION '横並び比較の完走UUが単体集計と食い違う (% : RPC=% 単体=%)',
        v_row.category_key, v_row.completer_uu, v_expected_comp;
    END IF;

    v_checked := v_checked + 1;
  END LOOP;

  IF v_checked = 0 THEN
    RAISE EXCEPTION '横並び比較の対象企画が1件も無い';
  END IF;
  RAISE NOTICE '横並び比較: % 企画で単体集計と一致', v_checked;
END;
$$;

-- 関数を追加したので Data API のキャッシュを再読み込みさせる。
NOTIFY pgrst, 'reload schema';

COMMIT;
