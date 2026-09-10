-- ===============================================
-- ChatGPT Images 2.5(gpt-image-2.5-flare)の canonical 9 値を model の CHECK に追加
-- ===============================================
-- 設計判断: docs/planning/gpt-image-2-5-flare-implementation-plan.md
--           ADR-002 / ADR-005(補正済み) / REQ-004
--
-- ⚠️ 適用順(ADR-005 補正): Phase 3 の Next.js(サーバーゲート isGptImage25Available)
--    → worker → **この migration** → Phase 4 の Next.js(UI)。
--    Phase 1 以降 `KNOWN_MODEL_INPUTS` は 2.5 を受理するため、ゲートより先に
--    この CHECK 拡張だけを出すと、直接 POST で誰でも 2.5 を実行できてしまう。
--    ゲートが本番に出るまで `supabase db push` しないこと。
--
-- 既存の 16 値(旧 `gpt-image-2-low` の履歴互換を含む)はそのまま残し、
-- family × quality × size tier の 9 値を末尾に足すだけ。既存行には影響しない。
-- gpt-image-2.5-sunburst は導入しない(ヒアリング 2026-09-10)。

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
  'gpt-image-2.5-flare-high-4k'
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
  'gpt-image-2.5-flare-high-4k'
));

-- ===============================================
-- 検証: 両テーブルの CHECK に 2.5 の 9 値と旧 `gpt-image-2-low` が含まれること
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
      -- 履歴互換(ロールバック安全性)
      'gpt-image-2-low',
      'gpt-image-2-low-1k',
      'gpt-image-2-high-4k',
      -- 今回追加した 9 値
      'gpt-image-2.5-flare-low-1k',
      'gpt-image-2.5-flare-low-2k',
      'gpt-image-2.5-flare-low-4k',
      'gpt-image-2.5-flare-medium-1k',
      'gpt-image-2.5-flare-medium-2k',
      'gpt-image-2.5-flare-medium-4k',
      'gpt-image-2.5-flare-high-1k',
      'gpt-image-2.5-flare-high-2k',
      'gpt-image-2.5-flare-high-4k'
    ] LOOP
      IF position('''' || v_model || '''' IN v_def) = 0 THEN
        RAISE EXCEPTION '%_model_check に % が含まれていない: %', v_table, v_model, v_def;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
