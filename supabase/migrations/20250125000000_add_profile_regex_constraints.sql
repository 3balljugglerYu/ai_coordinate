-- ===============================================
-- Add regex constraints to profiles table
-- < と > を禁止する正規表現チェックを追加
-- ===============================================

-- ニックネーム制約（NULL許容、NULLの場合はチェックをスキップ）
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_nickname_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_nickname_check
CHECK (
  char_length(nickname) <= 20 
  AND (nickname IS NULL OR nickname !~ '[<>]')
);

-- bio制約（NULL許容、NULLの場合はチェックをスキップ）
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_bio_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_bio_check
CHECK (
  char_length(bio) <= 200 
  AND (bio IS NULL OR bio !~ '[<>]')
);

