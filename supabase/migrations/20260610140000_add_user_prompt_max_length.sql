-- ===============================================
-- ユーザープロンプト入力欄の最大文字数(カテゴリ別)
-- ===============================================
-- show_user_prompt_input=true のカテゴリで、/style のテキストフィールドに
-- 入力できる文字数の上限を admin が設定できるようにする。
-- NULL は「既定値(GENERATION_PROMPT_MAX_LENGTH=1500)」。
-- 名前入力用途(例: 神コレの「うちの子の名前」)で 10 文字などに絞る想定。
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS user_prompt_max_length INTEGER;

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_user_prompt_max_length_check;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_user_prompt_max_length_check
  CHECK (
    user_prompt_max_length IS NULL
    OR (user_prompt_max_length >= 1 AND user_prompt_max_length <= 1500)
  );

COMMENT ON COLUMN public.preset_categories.user_prompt_max_length IS
  '/style ユーザープロンプト入力欄の最大文字数(NULL=既定1500)。show_user_prompt_input=true のとき有効';

-- ===============================================
-- DOWN:
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_user_prompt_max_length_check;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS user_prompt_max_length;
-- ===============================================
