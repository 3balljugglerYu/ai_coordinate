-- notificationsテーブルのtype制約を更新（'bonus'を追加）
-- 既存の制約を削除
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 新しい制約を追加（'bonus'を含む）
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY['like'::text, 'comment'::text, 'follow'::text, 'bonus'::text]));

