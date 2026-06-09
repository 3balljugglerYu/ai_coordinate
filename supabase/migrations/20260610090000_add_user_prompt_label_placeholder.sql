-- preset_categories: ユーザープロンプト入力欄のラベル/プレースホルダを運営から設定可能にする
-- 既存挙動 (admin が show_user_prompt_input=true にしたカテゴリで /style に
-- プロンプト textarea が出る) は変えず、その textarea の見出しと placeholder を
-- カテゴリ単位でカスタマイズできるようにする。
-- いずれも NULL なら既存の i18n デフォルト (userPromptLabel / userPromptPlaceholder) を使う。

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS user_prompt_label text NULL,
  ADD COLUMN IF NOT EXISTS user_prompt_placeholder text NULL;

COMMENT ON COLUMN public.preset_categories.user_prompt_label IS
  '/style のユーザープロンプト textarea のラベル (任意, NULL なら i18n デフォルト)';
COMMENT ON COLUMN public.preset_categories.user_prompt_placeholder IS
  '/style のユーザープロンプト textarea の placeholder (任意, NULL なら i18n デフォルト)';

-- 注: down migration (列削除) は明示しない。
-- 既に admin が設定したラベル/placeholder が消えるリスクがあるため、
-- ロールバックが必要なときは個別に DROP COLUMN を判断する。
