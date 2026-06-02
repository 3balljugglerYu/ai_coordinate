-- ===============================================
-- Creator Looks: generated_images.creator_notified_at 列追加
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-006, HI-007 対応
--
-- 通知 D (= 消費者がホーム投稿した時にクリエイターに通知) の重複防止用フラグ。
-- generated_images.is_posted が false → true に遷移したときに 1 回だけ通知 D を発火し、
-- creator_notified_at = now() を立てる。後で is_posted が true → false → true と再度遷移しても、
-- creator_notified_at IS NOT NULL なら通知 D は発火しない (= one-shot 化)。

BEGIN;

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS creator_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.generated_images.creator_notified_at IS
  'Creator Looks 通知 D の発火済みフラグ。is_posted=true へ初遷移時に now() が入る。NULL なら未通知';

-- インデックス: 「Creator Looks 起源かつ通知未送信」を高速に検出するため
-- (= 通知 D Trigger の効率化)
CREATE INDEX IF NOT EXISTS idx_generated_images_style_template_creator_notified
  ON public.generated_images (style_template_id, creator_notified_at)
  WHERE is_posted = true AND style_template_id IS NOT NULL;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_generated_images_style_template_creator_notified;
-- ALTER TABLE public.generated_images DROP COLUMN IF EXISTS creator_notified_at;
-- COMMIT;
-- ===============================================
