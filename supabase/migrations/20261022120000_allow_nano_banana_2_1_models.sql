-- ===============================================
-- Nano Banana 2.1(gemini-nano-banana-2.1)の保存名 9 値を model の CHECK に追加
-- ===============================================
-- 計画書: docs/planning/nano-banana-2-1-implementation-plan.md Phase 4 / ADR-006
--
-- ⚠️ 適用順(ADR-006): Phase 3 の Next.js(サーバーゲート isNanoBanana21Available)
--    → worker(v139 で 2.1 を考える量つきで呼ぶ)→ **この migration** → Phase 5 の UI。
--    Phase 3 以降 `KNOWN_MODEL_INPUTS` は 2.1 を受理するため、ゲートより先に
--    この CHECK 拡張だけを出すと、直接 POST で誰でも 2.1 を実行できてしまう。
--    ゲート(#782)と worker(v139)は 2026-10-22 に本番へ出ている。
--
-- 既存の 25 値(旧 `gpt-image-2-low` の履歴互換を含む)はそのまま残し、
-- 考える量 × サイズの 9 値を末尾に足すだけ。既存行には影響しない。
-- 本番の今の定義(2026-10-22 に pg_get_constraintdef で取得)と同じ並びに 9 値を足した。

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.generated_images
DROP CONSTRAINT IF EXISTS generated_images_model_check;

ALTER TABLE public.generated_images
ADD CONSTRAINT generated_images_model_check
CHECK (model IS NULL OR model IN (
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview-512',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k',
  'gpt-image-2-low',
  'gpt-image-2-low-1k',
  'gpt-image-2-low-2k',
  'gpt-image-2-low-4k',
  'gpt-image-2-medium-1k',
  'gpt-image-2-medium-2k',
  'gpt-image-2-medium-4k',
  'gpt-image-2-high-1k',
  'gpt-image-2-high-2k',
  'gpt-image-2-high-4k',
  'gpt-image-2.5-flare-low-1k',
  'gpt-image-2.5-flare-low-2k',
  'gpt-image-2.5-flare-low-4k',
  'gpt-image-2.5-flare-medium-1k',
  'gpt-image-2.5-flare-medium-2k',
  'gpt-image-2.5-flare-medium-4k',
  'gpt-image-2.5-flare-high-1k',
  'gpt-image-2.5-flare-high-2k',
  'gpt-image-2.5-flare-high-4k',
  'gemini-nano-banana-2.1-minimal-1k',
  'gemini-nano-banana-2.1-minimal-2k',
  'gemini-nano-banana-2.1-minimal-4k',
  'gemini-nano-banana-2.1-medium-1k',
  'gemini-nano-banana-2.1-medium-2k',
  'gemini-nano-banana-2.1-medium-4k',
  'gemini-nano-banana-2.1-high-1k',
  'gemini-nano-banana-2.1-high-2k',
  'gemini-nano-banana-2.1-high-4k'
));

ALTER TABLE public.image_jobs
DROP CONSTRAINT IF EXISTS image_jobs_model_check;

ALTER TABLE public.image_jobs
ADD CONSTRAINT image_jobs_model_check
CHECK (model IS NULL OR model IN (
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview-512',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k',
  'gpt-image-2-low',
  'gpt-image-2-low-1k',
  'gpt-image-2-low-2k',
  'gpt-image-2-low-4k',
  'gpt-image-2-medium-1k',
  'gpt-image-2-medium-2k',
  'gpt-image-2-medium-4k',
  'gpt-image-2-high-1k',
  'gpt-image-2-high-2k',
  'gpt-image-2-high-4k',
  'gpt-image-2.5-flare-low-1k',
  'gpt-image-2.5-flare-low-2k',
  'gpt-image-2.5-flare-low-4k',
  'gpt-image-2.5-flare-medium-1k',
  'gpt-image-2.5-flare-medium-2k',
  'gpt-image-2.5-flare-medium-4k',
  'gpt-image-2.5-flare-high-1k',
  'gpt-image-2.5-flare-high-2k',
  'gpt-image-2.5-flare-high-4k',
  'gemini-nano-banana-2.1-minimal-1k',
  'gemini-nano-banana-2.1-minimal-2k',
  'gemini-nano-banana-2.1-minimal-4k',
  'gemini-nano-banana-2.1-medium-1k',
  'gemini-nano-banana-2.1-medium-2k',
  'gemini-nano-banana-2.1-medium-4k',
  'gemini-nano-banana-2.1-high-1k',
  'gemini-nano-banana-2.1-high-2k',
  'gemini-nano-banana-2.1-high-4k'
));

-- ===============================================
-- 検証: 両テーブルの CHECK に 2.1 の 9 値と、既存の値が残っていること
-- ===============================================
-- リポジトリに SQL のテスト基盤が無いため、想定が崩れたら適用時点で落とす。
DO $$
DECLARE
  v_table text;
  v_def text;
  v_model text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['generated_images', 'image_jobs'] LOOP
    SELECT pg_get_constraintdef(c.oid)
      INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = v_table
      AND c.conname = v_table || '_model_check'
      AND c.contype = 'c';

    IF v_def IS NULL THEN
      RAISE EXCEPTION '%_model_check が見つからない', v_table;
    END IF;

    FOREACH v_model IN ARRAY ARRAY[
      -- 既存の値(残っていること)
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image-preview-512',
      'gemini-3-pro-image-4k',
      'gpt-image-2-low',
      'gpt-image-2.5-flare-high-4k',
      -- 今回追加した 9 値
      'gemini-nano-banana-2.1-minimal-1k',
      'gemini-nano-banana-2.1-minimal-2k',
      'gemini-nano-banana-2.1-minimal-4k',
      'gemini-nano-banana-2.1-medium-1k',
      'gemini-nano-banana-2.1-medium-2k',
      'gemini-nano-banana-2.1-medium-4k',
      'gemini-nano-banana-2.1-high-1k',
      'gemini-nano-banana-2.1-high-2k',
      'gemini-nano-banana-2.1-high-4k'
    ] LOOP
      IF position('''' || v_model || '''' IN v_def) = 0 THEN
        RAISE EXCEPTION '%_model_check に % が含まれていない: %', v_table, v_model, v_def;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
