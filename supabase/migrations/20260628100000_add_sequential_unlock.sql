-- カテゴリ内プリセットの「順番固定・1つずつ解放(sequential unlock)」フラグ。
-- true のとき:
--   - 前提カテゴリ(unlock_prerequisite_key)が無くても段階解放(drip)を適用する。
--   - 解放方向を sort_order 昇順(先頭=表紙から前へ)にする(既存 drip は降順)。
--   - progressive_batch_size 未設定時は 1(=1つずつ)として扱う(アプリ側で吸収)。
-- 既存カテゴリは false(従来挙動)を維持。追加列のみ・後方互換。
BEGIN;

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS sequential_unlock BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.preset_categories.sequential_unlock IS
  '順番固定の1つずつ解放。true で前提カテゴリ無しでも sort_order 昇順(先頭=表紙)から段階解放。既定 false。';

COMMIT;
