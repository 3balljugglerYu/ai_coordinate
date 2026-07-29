-- ===============================================
-- 検索インデックスの差し替え
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md ADR-007
--
-- 検索対象を generated_images.prompt から caption + profiles.nickname へ
-- 差し替えたが、対応するインデックスを作っていなかった。
--
-- 旧 prompt 検索は idx_generated_images_prompt_trgm に支えられていたのに対し、
-- caption / nickname の ILIKE は全表走査になっていた。結果として検索 API が
-- 数秒かかり、ヒット件数の多い語では 503 になっていた。
--
-- ILIKE '%...%' は前方一致でないため B-tree では効かない。pg_trgm の
-- GIN インデックスを使う。旧 prompt の trigram index は Phase 0C で
-- 列を空化するときに削除する。
--
-- CONCURRENTLY は supabase CLI のパイプライン実行では使えない
-- (25001: cannot be executed within a pipeline)。対象は generated_images 約3,500行、
-- profiles 数百行と小さく、通常の CREATE INDEX でもロックは一瞬で済むため
-- そちらを使う。取得できなければ止まるよう lock_timeout を置く。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- pg_trgm は extensions スキーマに入っている。gin_trgm_ops を解決するため
-- search_path へ加える (既存の idx_generated_images_prompt_trgm も同じ前提)。
SET LOCAL search_path = public, extensions;

-- 作品説明の部分一致検索
-- 検索対象は投稿済み行だけなので、既存の prompt index と同じく部分索引にする。
CREATE INDEX IF NOT EXISTS idx_generated_images_caption_trgm
  ON public.generated_images
  USING gin (caption gin_trgm_ops)
  WHERE (is_posted = true);

COMMENT ON INDEX public.idx_generated_images_caption_trgm IS
  '検索の作品説明マッチ用。ILIKE の部分一致を支える (ADR-007)';

-- 作者表示名の部分一致検索。
-- 検索語から候補 user_id を先に解決する経路で使う。
CREATE INDEX IF NOT EXISTS idx_profiles_nickname_trgm
  ON public.profiles
  USING gin (nickname gin_trgm_ops);

COMMENT ON INDEX public.idx_profiles_nickname_trgm IS
  '検索の作者名マッチ用。ILIKE の部分一致を支える (ADR-007)';

COMMIT;

-- ===============================================
-- DOWN:
-- DROP INDEX IF EXISTS public.idx_profiles_nickname_trgm;
-- DROP INDEX IF EXISTS public.idx_generated_images_caption_trgm;
-- ===============================================
