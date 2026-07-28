-- ===============================================
-- 異議申立てテーブル (削除判定単位)
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
--           ADR-004, ADR-005, ADR-008 / REQ-006〜009, REQ-012
--
-- 【なぜ投稿単位ではなく削除判定単位か】
-- 投稿単位の UNIQUE にすると、一度異議申立てをした投稿が後日「別の理由で」
-- 再度公開停止された場合に、新しい判定へ申し立てられなくなる。
-- moderation_audit_logs.id (= 削除判定 ID) を参照先とし、
-- UNIQUE (removal_decision_id, appellant_id) で「同じ判定への重複申立て」だけを防ぐ。
--
-- 【申立期限】
-- 利用規約は「措置の通知から原則として14日以内」と定めているため、起算点は
-- 判定時刻ではなく **削除通知の配送完了時刻** とする (outbox.delivered_at + 14日)。
-- 通知が未配送の間は期限切れにしない。申立て作成時に期限をスナップショットする。
--
-- 【独立レビュー (ADR-005)】
-- Santa Clara Principles は「元の判断に関与していない人によるレビュー」を求めるが、
-- 運営体制が1〜2名の現状で技術強制すると異議申立てを処理できなくなる。
-- そのため同一人物による再審査を禁止せず、independence_exception_reason の
-- 記録を必須にして監査可能にする。

BEGIN;

CREATE TABLE IF NOT EXISTS public.post_moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.generated_images(id) ON DELETE CASCADE,
  removal_decision_id UUID NOT NULL REFERENCES public.moderation_audit_logs(id) ON DELETE CASCADE,
  appellant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upheld', 'overturned')),
  -- upheld  = 元の公開停止判定を支持する (= UI の「棄却する」。公開停止のまま)
  -- overturned = 元の判定を覆す (= UI の「認める」。visible に復帰)
  decision_note TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  independence_exception_reason TEXT,
  appeal_deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 同じ削除判定に対する重複申立てのみを禁止する
  CONSTRAINT uq_post_moderation_appeals_decision_appellant
    UNIQUE (removal_decision_id, appellant_id),

  -- pending は判定3項目がすべて NULL、判定済みはすべて NOT NULL
  CONSTRAINT post_moderation_appeals_decision_consistency CHECK (
    (status = 'pending'
      AND decision_note IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR
    (status <> 'pending'
      AND decision_note IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_post_moderation_appeals_status_created
  ON public.post_moderation_appeals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_moderation_appeals_appellant_created
  ON public.post_moderation_appeals (appellant_id, created_at DESC);

COMMENT ON COLUMN public.post_moderation_appeals.status IS
  'pending / upheld (=棄却・公開停止のまま) / overturned (=認容・visible に復帰)。日本語ラベルと取り違えないこと。';
COMMENT ON COLUMN public.post_moderation_appeals.independence_exception_reason IS
  '元の判定者と同一人物が再審査した場合の例外理由 (ADR-005)。';

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.post_moderation_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own appeals" ON public.post_moderation_appeals;
CREATE POLICY "Users can view their own appeals"
  ON public.post_moderation_appeals
  FOR SELECT
  USING ((select auth.uid()) = appellant_id);

DROP POLICY IF EXISTS "Users can create their own appeals" ON public.post_moderation_appeals;
CREATE POLICY "Users can create their own appeals"
  ON public.post_moderation_appeals
  FOR INSERT
  WITH CHECK ((select auth.uid()) = appellant_id);

-- UPDATE / DELETE の policy は作らない (= 運営更新は service_role のみ)

-- ===============================================
-- guard trigger: 対象が「自分の投稿の、現在有効な公開停止判定」であることを DB でも強制
-- ===============================================
-- CHECK 制約は他テーブルを参照できないため trigger で実装する。
-- API 層でも検証するが、DB を直接叩かれても弾けるようにする二重ガード。
-- 既存 20260602100600_creator_looks_db_guard_triggers.sql の書式を踏襲。
CREATE OR REPLACE FUNCTION public.enforce_post_moderation_appeal_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision RECORD;
  v_post_user_id UUID;
  v_post_status TEXT;
BEGIN
  SELECT id, post_id, action
    INTO v_decision
  FROM public.moderation_audit_logs
  WHERE id = NEW.removal_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal_decision_not_found'
      USING ERRCODE = '23503';
  END IF;

  -- 公開停止の判定にのみ申し立てられる (pending_auto / approve は対象外)
  IF v_decision.action <> 'reject' THEN
    RAISE EXCEPTION 'appeal_target_not_a_removal'
      USING ERRCODE = '22023',
            HINT = 'removal_decision_id must reference a reject decision.';
  END IF;

  -- 申立ての post_id は判定の post_id と一致していること
  IF v_decision.post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'appeal_post_mismatch'
      USING ERRCODE = '22023';
  END IF;

  SELECT user_id, moderation_status
    INTO v_post_user_id, v_post_status
  FROM public.generated_images
  WHERE id = NEW.post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal_post_not_found'
      USING ERRCODE = '23503';
  END IF;

  -- 投稿者本人以外は申し立てられない
  IF v_post_user_id IS DISTINCT FROM NEW.appellant_id THEN
    RAISE EXCEPTION 'appeal_appellant_not_post_owner'
      USING ERRCODE = '42501';
  END IF;

  -- 既に復帰済みの投稿には申し立てられない
  IF v_post_status <> 'removed' THEN
    RAISE EXCEPTION 'appeal_post_not_removed'
      USING ERRCODE = '22023',
            HINT = 'The post is not currently removed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_post_moderation_appeal_target
  ON public.post_moderation_appeals;
CREATE TRIGGER trg_enforce_post_moderation_appeal_target
  BEFORE INSERT ON public.post_moderation_appeals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_post_moderation_appeal_target();

REVOKE ALL ON FUNCTION public.enforce_post_moderation_appeal_target()
  FROM PUBLIC, anon;

-- outbox.appeal_id の参照整合性。outbox テーブルが先に作られるため、
-- appeals テーブル作成後の本マイグレーションで後付けする。
-- 申立てが消えても配送済み通知の履歴は残したいので ON DELETE SET NULL。
ALTER TABLE public.moderation_notification_outbox
  DROP CONSTRAINT IF EXISTS moderation_outbox_appeal_id_fkey;
ALTER TABLE public.moderation_notification_outbox
  ADD CONSTRAINT moderation_outbox_appeal_id_fkey
  FOREIGN KEY (appeal_id) REFERENCES public.post_moderation_appeals(id) ON DELETE SET NULL;

COMMIT;

-- ===============================================
-- DOWN:
-- 運用データを伴うため安易な DROP は行わない。まず API / UI 側で新規受付を
-- 止め、申立てデータを保持したまま様子を見ること。
--
-- 完全に戻す場合 (データ保全確認後にのみ実施):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_post_moderation_appeal_target ON public.post_moderation_appeals;
-- DROP FUNCTION IF EXISTS public.enforce_post_moderation_appeal_target();
-- DROP TABLE IF EXISTS public.post_moderation_appeals;
-- COMMIT;
-- ===============================================
