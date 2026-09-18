-- ===============================================
-- User ORIGINAL (/user-styles): 一覧と作者チップを支える部分インデックス
-- ===============================================
-- 計画書: docs/planning/user-original-styles-implementation-plan.md Phase 1
--
-- get_user_style_page の newest 並びは (posted_at DESC, id DESC) の keyset で、
-- 掲載条件（CANONICAL LISTING PREDICATE）で絞ってから LIMIT する。
-- 索引が無いと毎回の全表走査になり、そのうえ 1 行ごとに
-- validate_derived_prompt_source（plpgsql）が走るので急速に重くなる。
--
-- ⭐ CONCURRENTLY は使わない。supabase CLI のパイプライン実行では
--    25001 (cannot be executed within a pipeline) で失敗する
--    （20260729170000_add_search_indexes.sql に同じ記録がある）。
--    generated_images は約 6,000 行・17 MB と小さく、通常の CREATE INDEX でも
--    ロックは一瞬で済む。取得できなければ止まるよう lock_timeout を置く。
--
-- ⭐ 部分索引の WHERE は掲載条件のうち**不変な列条件だけ**にする。
--    posted_at / id は索引のキーなので WHERE には入れない。
--    moderation_status は後から変わる（公開停止）ので入れない
--    ── 入れると状態変化のたびに索引から出入りして HOT 更新が効かなくなる。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 一覧（すべて / 👑）の走査順。
-- keyset の比較 (posted_at, id) < (cursor...) と ORDER BY をそのまま支える。
CREATE INDEX IF NOT EXISTS idx_generated_images_user_style_feed
  ON public.generated_images (posted_at DESC, id DESC)
  WHERE generation_type = 'free'
    AND is_posted = true
    AND source_post_id IS NULL
    AND pre_generation_storage_path IS NOT NULL
    AND show_before_image = true;

COMMENT ON INDEX public.idx_generated_images_user_style_feed IS
  '/user-styles の一覧。(posted_at,id) の keyset 走査を支える部分索引';

-- 作者チップ（get_user_style_followed_authors）と、作者で絞った一覧。
-- 作者ごとに「最新の掲載対象1件」を LIMIT 1 で取るので user_id を先頭に置く。
CREATE INDEX IF NOT EXISTS idx_generated_images_user_style_by_author
  ON public.generated_images (user_id, posted_at DESC, id DESC)
  WHERE generation_type = 'free'
    AND is_posted = true
    AND source_post_id IS NULL
    AND pre_generation_storage_path IS NOT NULL
    AND show_before_image = true;

COMMENT ON INDEX public.idx_generated_images_user_style_by_author IS
  '/user-styles の作者チップと作者絞り込み。作者ごとの最新1件を支える部分索引';

COMMIT;

-- ===============================================
-- DOWN:
--   DROP INDEX IF EXISTS public.idx_generated_images_user_style_feed;
--   DROP INDEX IF EXISTS public.idx_generated_images_user_style_by_author;
-- ===============================================
