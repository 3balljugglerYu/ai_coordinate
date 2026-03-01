-- ===============================================
-- Add regex constraints to comments table
-- < と > を禁止する正規表現チェックを追加
-- ===============================================

-- コメントcontent制約（NULL許容ではないが、念のためNULLチェックも含める）
ALTER TABLE public.comments
DROP CONSTRAINT IF EXISTS comments_content_check;

ALTER TABLE public.comments
ADD CONSTRAINT comments_content_check
CHECK (
  char_length(content) <= 200 
  AND content !~ '[<>]'
);

