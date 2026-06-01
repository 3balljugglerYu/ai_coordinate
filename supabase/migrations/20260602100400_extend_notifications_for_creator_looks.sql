-- ===============================================
-- notifications CHECK 拡張: creator_looks_* タイプを追加
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-002, REQ-004, REQ-006
-- 既存 20260518150600_extend_notifications_for_catalog.sql を踏襲。
--
-- 追加 type:
--   creator_looks_submission_received    通知 A: 運営に「新規投稿があります」
--   creator_looks_submission_acknowledged 通知 B: クリエイター本人に「投稿を受け付けました」
--   creator_looks_moderation_result      通知 C: クリエイター本人に「承認 / 却下」
--   creator_looks_post_published         通知 D: クリエイター本人に「あなたの衣装で投稿が公開されました」
--
-- 追加 entity_type:
--   creator_looks_template (= user_style_templates 行を指す)

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
  'catalog_entry_unpublished'::text,
  'creator_looks_submission_received'::text,
  'creator_looks_submission_acknowledged'::text,
  'creator_looks_moderation_result'::text,
  'creator_looks_post_published'::text
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
  'catalog_entry'::text,
  'creator_looks_template'::text
]));

COMMIT;

-- ===============================================
-- DOWN:
-- (既存値を保持する形で個別に CHECK を戻す必要がある)
-- ===============================================
