-- ===============================================
-- notifications CHECK 拡張: catalog_entry_* タイプを追加
-- ===============================================
-- 既存 Inspire の 20260502124744_extend_notifications_for_style_template.sql を踏襲。
-- 会員投稿者にだけ通知される (ゲストはメールフィールド経由)。

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
  'style_template_unpublished'::text,
  'catalog_entry_approved'::text,
  'catalog_entry_rejected'::text,
  'catalog_entry_unpublished'::text
]));

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_entity_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_entity_type_check
CHECK (entity_type = ANY (ARRAY[
  'post'::text,
  'comment'::text,
  'user'::text,
  'style_template'::text,
  'catalog_entry'::text
]));

COMMIT;

-- ===============================================
-- DOWN:
-- (Inspire 拡張時と同様、既存値を保持する形で個別に CHECK を戻す必要がある)
-- ===============================================
