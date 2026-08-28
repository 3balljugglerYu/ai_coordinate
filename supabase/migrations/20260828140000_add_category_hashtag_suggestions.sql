-- 企画（プリセットカテゴリ）ごとに、投稿時へ出すハッシュタグ候補を持たせる。
--
-- 目的は表記ゆれを止めること。放っておくと同じ企画が `#豪州旅行` `#オーストラリア旅行`
-- `#うちの子オーストラリア` に割れ、どれを押しても全体が見えない状態になる。
-- 候補を出しておけば大半がそこに乗る。
--
-- ⚠️ これは「自動でタグを付ける」仕組みではない。候補として出すだけで、
-- 実際に付くのは投稿者が押したときだけ（タグの実体は説明文に書かれた文字）。
-- 詳細は docs/planning/hashtag-search-implementation-plan.md の Phase 6a

BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS hashtag_suggestions text[] NOT NULL DEFAULT '{}';

-- 上限 5 個。要素は lib/hashtag.ts の規則に沿った表記で持つ:
--   `#` は含めない / 空白と改行を含まない / 1〜50 文字
-- 規則そのものの検証は TypeScript が正本で、ここは器としての最低限だけを縛る。
--
-- CHECK 制約にサブクエリは書けない（0A000）ため、判定は関数に切り出す。
-- EXECUTE は PUBLIC のままにする。CHECK は書き込みを行うロールの権限で評価される
-- ので、閉じると preset_categories への書き込み自体が失敗する。
-- データを読まない純粋な判定関数なので、公開していても漏れるものが無い。
CREATE OR REPLACE FUNCTION public.hashtag_suggestions_valid(p_tags text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_length(p_tags, 1), 0) <= 5
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(p_tags, '{}'::text[])) AS tag
      WHERE tag !~ '^[^\s#＃]{1,50}$'
    );
$$;

COMMENT ON FUNCTION public.hashtag_suggestions_valid(text[]) IS
  'preset_categories.hashtag_suggestions の形式検証（CHECK 制約から呼ぶ）。規則の正本は lib/hashtag.ts';

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_hashtag_suggestions_check;

ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_hashtag_suggestions_check
  CHECK (public.hashtag_suggestions_valid(hashtag_suggestions));

COMMENT ON COLUMN public.preset_categories.hashtag_suggestions IS
  '投稿時に出すタグ候補（最大5個・`#` を含めない表記）。押して初めて説明文に入る。空なら候補を出さない。';

COMMIT;
