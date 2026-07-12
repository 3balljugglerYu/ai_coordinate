-- ことわざ辞典等の「Xシェア抽選プレゼント対象か」をカテゴリ単位で admin 設定可能にする。
-- true のとき、そのカテゴリの完走台紙(所有者)に「Xで応募する」ボタンを出す。
-- 応募受付期間は既存の collection_display_starts_at/ends_at(企画期間)を流用する。
-- 既存カテゴリに影響しないよう default false。
ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS lottery_target BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.preset_categories.lottery_target IS
  'Xシェア抽選プレゼントの対象カテゴリか。true で完走台紙に応募ボタンを表示(受付期間は collection_display 期間を流用)。';
