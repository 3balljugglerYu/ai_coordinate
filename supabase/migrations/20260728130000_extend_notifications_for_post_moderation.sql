-- ===============================================
-- notifications CHECK 拡張: post_moderation_* タイプを追加
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
--           REQ-001, REQ-010, ADR-001
--
-- 既存 20260602100400_extend_notifications_for_creator_looks.sql を踏襲。
--
-- 追加 type:
--   post_moderation_removed       投稿者本人に「投稿を公開停止しました」(reject 判定時)
--   post_moderation_appeal_result 投稿者本人に「異議申立ての結果」(uphold / overturn 判定時)
--
-- entity_type は既存の 'post' を再利用するため CHECK 変更なし。
-- entity_id には generated_images.id が入る。
--
-- 併せて outbox dispatcher の冪等性を担保するための部分 UNIQUE index を張る。
-- dispatcher は同じ event_key で複数回走りうるため (cron 再試行 / 並行実行)、
-- 通知テーブル側でも重複を弾く。

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
  'creator_looks_post_published'::text,
  'post_moderation_removed'::text,
  'post_moderation_appeal_result'::text
]));

-- dispatcher の冪等キー。moderation 系 type に限定した部分 UNIQUE index。
-- 既存の他 type の通知には一切影響しない。
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_moderation_event_key
  ON public.notifications ((data->>'moderation_event_key'))
  WHERE type IN ('post_moderation_removed', 'post_moderation_appeal_result');

COMMIT;

-- ===============================================
-- DOWN:
-- 値の「追加のみ」なので既存行に影響しない。
-- 意図的に DOWN を提供しない: 制約を旧14値に戻すと、既に発行済みの
-- post_moderation_* 通知行が制約違反になり ALTER 自体が失敗する。
-- ロールバックが必要な場合は、先に該当行を削除してから旧 CHECK を張り直すこと。
--
-- index のみ戻す場合:
--   DROP INDEX IF EXISTS public.uq_notifications_moderation_event_key;
-- ===============================================
