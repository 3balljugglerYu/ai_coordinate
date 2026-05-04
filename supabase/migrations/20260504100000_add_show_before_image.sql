-- generated_images テーブルに「Before（生成元）画像を表示するか」のフラグ列を追加。
-- 投稿モーダル / 編集モーダルのチェックボックスでユーザーが切替可能。
-- DEFAULT TRUE のため既存行は全件「表示する」となり、過去投稿の見え方は変わらない。
-- Storage オブジェクト（pre_generation_storage_path）は本フラグでは削除しない（DB 表示制御のみ）。
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS show_before_image BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.generated_images.show_before_image IS
  'Before（生成元）画像を投稿詳細で表示するか。投稿モーダル / 編集モーダルから切替。FALSE のとき UI 側で Before/After 比較を非表示にする（pre_generation_storage_path 自体は残す）。';
