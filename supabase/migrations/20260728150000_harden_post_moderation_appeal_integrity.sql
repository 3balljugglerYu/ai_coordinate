-- ===============================================
-- 異議申立ての完全性強化: 作成の RPC 集約と「最新判定」の強制
-- ===============================================
-- レビュー指摘 [P1] 2件への対応。
-- 計画: docs/planning/post-moderation-notification-implementation-plan.md
--       REQ-007, REQ-008, REQ-009, REQ-011 / ADR-004, ADR-005
--
-- 【問題1: 本人向け INSERT ポリシーで状態・期限・判定者を偽装できる】
-- `WITH CHECK (auth.uid() = appellant_id)` しか無いため、authenticated ユーザーが
-- PostgREST を直接叩いて以下を指定できた:
--   - status = 'overturned' (CHECK 制約は判定3項目が揃っていれば通るため)
--   - 任意の decision_note / decided_by / decided_at
--   - 任意または NULL の appeal_deadline_at (制約なし)
--   - API 上限 (1000字) を超える body (DB 側に長さ制約なし)
--   - independence_exception_reason
-- また SELECT ポリシーは行全体を許可するため、アプリの出口射影を迂回して
-- decided_by (判定した運営の user id) と independence_exception_reason を直接読めた。
--
-- 【問題2: 古い削除判定の申立てで最新の公開停止を解除できる】
-- guard trigger は「同じ投稿の reject であること」「投稿が現在 removed であること」
-- しか見ておらず、「その reject が現在有効な最新判定か」を検証していなかった。
-- decide_post_moderation_appeal も overturn 時に無条件で visible へ戻していた。
-- このため、一度復帰した後に別理由で再度公開停止された投稿に古い未処理申立てが
-- 残っていると、その認容が新しい公開停止まで解除してしまう。
--
-- 【対応】
--   1. 申立て作成を SECURITY DEFINER RPC に集約し、INSERT ポリシーを撤去する。
--      auth.uid() / 初期状態 / 期限 / 最新判定を DB 内で決定する
--   2. body の長さ制約を DB に追加する
--   3. guard trigger を backstop として残しつつ「最新の reject 判定」検証を追加
--   4. decide_post_moderation_appeal の overturn で、投稿をロックしたうえで
--      申立て対象が現在有効な削除判定かを再検証する

BEGIN;

-- ── 1. body の長さ制約 (API 上限と揃える) ───────────────────────
ALTER TABLE public.post_moderation_appeals
  DROP CONSTRAINT IF EXISTS post_moderation_appeals_body_length_check;
ALTER TABLE public.post_moderation_appeals
  ADD CONSTRAINT post_moderation_appeals_body_length_check
  CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000);

-- ── 2. 「現在有効な削除判定 ID」を求める共通関数 ──────────────────
-- 投稿が removed でなければ NULL。removed なら最新の reject 判定 ID を返す。
CREATE OR REPLACE FUNCTION public.current_post_removal_decision_id(p_post_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.moderation_audit_logs l
  JOIN public.generated_images g ON g.id = l.post_id
  WHERE l.post_id = p_post_id
    AND l.action = 'reject'
    AND g.moderation_status = 'removed'
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_post_removal_decision_id(UUID) IS
  '投稿の現在有効な公開停止判定 ID。removed でなければ NULL (REQ-009)。';

REVOKE ALL ON FUNCTION public.current_post_removal_decision_id(UUID) FROM PUBLIC, anon;

-- ── 3. guard trigger に「最新判定」検証を追加 ────────────────────
-- 作成経路は RPC に集約するが、trigger は DB 直叩きに対する最終防壁として残す。
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
  v_current_decision_id UUID;
BEGIN
  -- 初期状態の偽装を禁止する。判定列は RPC / service_role の UPDATE でのみ埋まる。
  IF NEW.status <> 'pending'
     OR NEW.decision_note IS NOT NULL
     OR NEW.decided_by IS NOT NULL
     OR NEW.decided_at IS NOT NULL
     OR NEW.independence_exception_reason IS NOT NULL THEN
    RAISE EXCEPTION 'appeal_must_be_created_as_pending'
      USING ERRCODE = '42501',
            HINT = 'status must be pending and decision columns must be NULL on insert.';
  END IF;

  SELECT id, post_id, action
    INTO v_decision
  FROM public.moderation_audit_logs
  WHERE id = NEW.removal_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal_decision_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_decision.action <> 'reject' THEN
    RAISE EXCEPTION 'appeal_target_not_a_removal'
      USING ERRCODE = '22023',
            HINT = 'removal_decision_id must reference a reject decision.';
  END IF;

  IF v_decision.post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'appeal_post_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT user_id, moderation_status
    INTO v_post_user_id, v_post_status
  FROM public.generated_images
  WHERE id = NEW.post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal_post_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_post_user_id IS DISTINCT FROM NEW.appellant_id THEN
    RAISE EXCEPTION 'appeal_appellant_not_post_owner' USING ERRCODE = '42501';
  END IF;

  IF v_post_status <> 'removed' THEN
    RAISE EXCEPTION 'appeal_post_not_removed'
      USING ERRCODE = '22023',
            HINT = 'The post is not currently removed.';
  END IF;

  -- 現在有効な削除判定に対してのみ申し立てられる (REQ-009)。
  -- 古い判定への申立てを認めると、その認容が新しい公開停止まで解除してしまう。
  v_current_decision_id := public.current_post_removal_decision_id(NEW.post_id);
  IF v_current_decision_id IS DISTINCT FROM NEW.removal_decision_id THEN
    RAISE EXCEPTION 'appeal_target_not_current_removal'
      USING ERRCODE = '22023',
            HINT = 'removal_decision_id must be the currently effective removal decision.';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. 申立て作成を SECURITY DEFINER RPC に集約 ──────────────────
-- appellant_id / status / appeal_deadline_at / post_id をすべて DB 側で決定する。
-- 期限は removal outbox の delivered_at + 14日。未配送なら期限なし (投稿者に
-- 不利益を転嫁しないため)。
CREATE OR REPLACE FUNCTION public.create_post_moderation_appeal(
  p_decision_id UUID,
  p_body TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_decision RECORD;
  v_post_user_id UUID;
  v_post_status TEXT;
  v_current_decision_id UUID;
  v_delivered_at TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_appeal_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'appeal_auth_required' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'appeal_body_invalid_length'
      USING ERRCODE = '22023', HINT = 'body must be 1..1000 characters.';
  END IF;

  SELECT id, post_id, action INTO v_decision
  FROM public.moderation_audit_logs
  WHERE id = p_decision_id;

  IF NOT FOUND OR v_decision.action <> 'reject' THEN
    -- 他人の判定・存在しない判定・reject 以外はまとめて「無い」扱いにする
    RAISE EXCEPTION 'appeal_decision_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 判定と同時に他経路で状態が変わらないよう投稿をロックする
  SELECT user_id, moderation_status
    INTO v_post_user_id, v_post_status
  FROM public.generated_images
  WHERE id = v_decision.post_id
  FOR UPDATE;

  IF NOT FOUND OR v_post_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'appeal_decision_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_post_status <> 'removed' THEN
    RAISE EXCEPTION 'appeal_post_not_removed' USING ERRCODE = '22023';
  END IF;

  v_current_decision_id := public.current_post_removal_decision_id(v_decision.post_id);
  IF v_current_decision_id IS DISTINCT FROM p_decision_id THEN
    RAISE EXCEPTION 'appeal_target_not_current_removal' USING ERRCODE = '22023';
  END IF;

  -- 期限は DB 側で算出する (クライアント指定を受け付けない)
  SELECT delivered_at INTO v_delivered_at
  FROM public.moderation_notification_outbox
  WHERE moderation_decision_id = p_decision_id
    AND notification_type = 'post_moderation_removed'
  LIMIT 1;

  IF v_delivered_at IS NOT NULL THEN
    v_deadline := v_delivered_at + interval '14 days';
    IF now() > v_deadline THEN
      RAISE EXCEPTION 'appeal_deadline_passed' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_deadline := NULL;
  END IF;

  INSERT INTO public.post_moderation_appeals (
    post_id, removal_decision_id, appellant_id, body, status, appeal_deadline_at
  ) VALUES (
    v_decision.post_id, p_decision_id, v_uid, v_body, 'pending', v_deadline
  )
  RETURNING id INTO v_appeal_id;

  RETURN v_appeal_id;
END;
$$;

COMMENT ON FUNCTION public.create_post_moderation_appeal(UUID, TEXT) IS
  '異議申立ての作成。appellant_id は auth.uid()、状態は pending、期限は outbox の delivered_at から DB 側で決定する。対象は現在有効な削除判定のみ (REQ-007〜009)。';

REVOKE ALL ON FUNCTION public.create_post_moderation_appeal(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_post_moderation_appeal(UUID, TEXT) TO authenticated;

-- ── 5. 直接 INSERT を禁止する ───────────────────────────────────
-- 作成は上記 RPC 経由のみ。RPC は SECURITY DEFINER なので RLS をバイパスする。
DROP POLICY IF EXISTS "Users can create their own appeals" ON public.post_moderation_appeals;

-- SELECT は本人のみのまま維持するが、運営の個人情報を含む列は読ませない。
-- PostgREST は列単位の GRANT を尊重するため、テーブル権限で絞る。
REVOKE ALL ON TABLE public.post_moderation_appeals FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  post_id,
  removal_decision_id,
  appellant_id,
  body,
  status,
  decision_note,
  decided_at,
  appeal_deadline_at,
  created_at
) ON TABLE public.post_moderation_appeals TO authenticated;

COMMENT ON COLUMN public.post_moderation_appeals.decided_by IS
  '判定した運営の user id。authenticated には列 GRANT を与えず、投稿者へ露出させない。';
COMMENT ON COLUMN public.post_moderation_appeals.independence_exception_reason IS
  '独立レビュー不可の例外理由 (監査用)。authenticated には列 GRANT を与えない。';

COMMIT;

-- ===============================================
-- DOWN:
-- 権限の緩和方向のロールバックは行わない (脆弱性の再導入)。
-- 作成 RPC を撤去する場合は、INSERT ポリシーを復活させる前に
-- guard trigger の状態偽装ガードを維持したままにすること。
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.create_post_moderation_appeal(UUID, TEXT);
-- COMMIT;
-- ===============================================
