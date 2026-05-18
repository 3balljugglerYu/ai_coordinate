-- ===============================================
-- notifications CHECK 拡張: style_template_* タイプを追加
-- ===============================================

BEGIN;

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'like'::text,
  'comment'::text,
  'follow'::text,
  'bonus'::text,
  'style_template_approved'::text,
  'style_template_rejected'::text,
  'style_template_unpublished'::text
]));

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_entity_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_entity_type_check
CHECK (entity_type = ANY (ARRAY[
  'post'::text,
  'comment'::text,
  'user'::text,
  'style_template'::text
]));

COMMIT;
