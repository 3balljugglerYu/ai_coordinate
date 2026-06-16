-- コレクションの「解放ゲート」を表現する列を preset_categories に追加する。
--
-- 目的:
--   「うちの子の神コレクション【ぷち神】」(collectible_wafer_sticker_god_petit_6p) のように、
--   別カテゴリ(神コレ本編)を完走したユーザーにのみ出現し、さらにカテゴリ内のプリセットを
--   段階的(2体ずつ)に解放するための設定値を保持する。
--
-- 設計メモ:
--   - 解放の最終判定は「ユーザーごと」に行う(完走有無・生成済み体数に依存)ため、
--     ここではカテゴリ単位の「解放ルール」だけを持ち、判定ロジックは serving 層で行う。
--   - 既存カテゴリは両列とも NULL(=従来どおりの無条件公開)で挙動不変。

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS unlock_prerequisite_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS progressive_batch_size INTEGER NULL;

COMMENT ON COLUMN public.preset_categories.unlock_prerequisite_key IS
  '解放の前提条件となる別カテゴリの key。設定時、当該カテゴリを完走(collection_completions.mount_status=completed)したユーザーにのみ解放する。NULL なら前提条件なし。';

COMMENT ON COLUMN public.preset_categories.progressive_batch_size IS
  'カテゴリ内プリセットを段階解放する単位(例: 2 なら 2 体ずつ)。解放数 = batch + batch * floor(そのユーザーの distinct 生成体数 / batch)。NULL なら一括解放。';

-- batch は正の整数のみ許可(NULL は許可)
ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_progressive_batch_size_positive;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_progressive_batch_size_positive
  CHECK (progressive_batch_size IS NULL OR progressive_batch_size > 0);
