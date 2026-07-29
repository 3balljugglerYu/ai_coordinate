-- ===============================================
-- Phase 0A の是正: 誤った前提に由来する分類と列を削る
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-013（撤回）/ ADR-014（撤回）/ REQ-003a
--
-- 20260729100000 は「既存の generated_images.prompt はビルド済み最終
-- プロンプトであり、生入力は復元できない」という前提で
--   - source_kind に 'legacy_built' を用意し
--   - 派生 job が固定するテンプレート版として template_revision_id を用意
-- していた。この前提は本番実測で誤りだった。
--
-- 実際には組み立ては Worker が実行時に行っており、DB には生入力しか残らない。
--
--   generation_type | 全行  | 運営の錨を含む
--   ----------------+-------+----------------
--   one_tap_style   | 2,110 | 1,165   <- 組み立て済み。運営資産
--   coordinate      | 1,307 |     0   <- 生入力
--   free            |    21 |     0   <- 生入力
--   inspire         |    89 |     0   <- "inspire" / "creator-looks" のマーカー値
--
-- したがって:
--   - 'legacy_built' に該当する行は 1 件も存在しない。既存の coordinate / free は
--     そのまま 'author_input' として移行できる
--   - テンプレート版の固定も不要。通常生成は現在も実行時に現行テンプレートで
--     組み立てており、再試行時のバイト一致は元から保証されていない。派生 job
--     だけ版を固定するのは既存挙動より厳格で整合しない。さらに revision の保存は
--     運営の錨を DB へ新たに書き出すことになり、秘密の保管場所を増やしてしまう
--
-- どちらもまだ利用箇所が無いため、使われない選択肢を残して将来の読み手を
-- 誤解させるより、いま削るほうが安全である。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 1. source_kind から 'legacy_built' を外す
-- 既存行が無いことを前提にするのではなく、実際に 0 件であることを確認してから
-- 制約を張り替える。1 件でもあれば失敗させ、想定外の状態で進めない。
DO $$
DECLARE
  v_legacy_count integer;
BEGIN
  SELECT count(*)
  INTO v_legacy_count
  FROM public.generated_image_prompt_secrets
  WHERE source_kind = 'legacy_built';

  IF v_legacy_count > 0 THEN
    RAISE EXCEPTION
      'legacy_built rows exist (%). 分類の見直しが必要なため中断する', v_legacy_count;
  END IF;
END;
$$;

ALTER TABLE public.generated_image_prompt_secrets
  DROP CONSTRAINT IF EXISTS generated_image_prompt_secrets_source_kind_check;

ALTER TABLE public.generated_image_prompt_secrets
  ADD CONSTRAINT generated_image_prompt_secrets_source_kind_check
  CHECK (source_kind IN ('author_input'));

COMMENT ON COLUMN public.generated_image_prompt_secrets.source_kind IS
  'author_input のみ。既存の coordinate / free も生入力そのものなので加工せず移行する';

-- 2. 派生 record の CHECK から template_revision_id への言及を外し、列を落とす
ALTER TABLE public.generation_prompt_snapshots
  DROP CONSTRAINT IF EXISTS generation_prompt_snapshots_materialized_shape;

ALTER TABLE public.generation_prompt_snapshots
  ADD CONSTRAINT generation_prompt_snapshots_materialized_shape CHECK (
    snapshot_kind <> 'materialized'
    OR provider_prompt IS NOT NULL
  );

ALTER TABLE public.generation_prompt_snapshots
  DROP COLUMN IF EXISTS template_revision_id;

COMMENT ON TABLE public.generation_prompt_snapshots IS
  '全新規 job の生成実行入力。service_role と SECURITY DEFINER 関数のみアクセス可。派生 job は本文を持たず、Worker が実行時に author secret から通常の free 生成と同じ builder で組み立てる';

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE public.generation_prompt_snapshots ADD COLUMN template_revision_id UUID;
-- ALTER TABLE public.generated_image_prompt_secrets
--   DROP CONSTRAINT generated_image_prompt_secrets_source_kind_check,
--   ADD CONSTRAINT generated_image_prompt_secrets_source_kind_check
--     CHECK (source_kind IN ('author_input','legacy_built'));
-- COMMIT;
-- ===============================================
