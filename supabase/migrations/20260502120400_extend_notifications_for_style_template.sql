-- ===============================================
-- notifications CHECK 拡張: style_template_* タイプを追加
-- ===============================================
-- REQ-N-01 / REQ-N-02 / REQ-N-03 / REQ-N-04 参照
-- 既存パターン: 20260108080809_update_notifications_type_constraint.sql を踏襲
--
-- 既存:
--   type IN ('like','comment','follow','bonus')
--   entity_type IN ('post','comment','user')
-- 拡張後:
--   type IN (上記 + 'style_template_approved','style_template_rejected','style_template_unpublished')
--   entity_type IN (上記 + 'style_template')

BEGIN;

-- type CHECK 拡張
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

-- entity_type CHECK 拡張
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

-- ===============================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
-- ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
--   CHECK (entity_type = ANY (ARRAY['post'::text,'comment'::text,'user'::text]));
-- ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
--   CHECK (type = ANY (ARRAY['like'::text,'comment'::text,'follow'::text,'bonus'::text]));
-- COMMIT;
-- ===============================================
