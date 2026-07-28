-- ===============================================
-- 異議申立ての判定 RPC
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
--           ADR-005, ADR-009 / REQ-010, REQ-011, REQ-012
--
-- 【用語】
--   p_action = 'uphold'   → status='upheld'    元の公開停止を支持 (UI の「棄却する」)
--                                              投稿は removed のまま
--   p_action = 'overturn' → status='overturned' 元の判定を覆す (UI の「認める」)
--                                              投稿を visible に復帰
--   日本語ラベルと逆に実装しやすいので注意する。
--
-- 【原子性】
-- overturn 時は「申立ての更新 + 投稿の復帰 + 監査ログ + 結果 outbox」を
-- 同一トランザクションで確定する。
--
-- 【独立レビュー (ADR-005)】
-- 元の判定者と同一人物が再審査する場合、p_independence_exception_reason を必須にする。
-- 別人が審査する場合は不要。運営体制が拡大したら、この分岐を
-- 「同一人物なら RAISE EXCEPTION」に変更するだけで強制へ移行できる。

BEGIN;

CREATE OR REPLACE FUNCTION public.decide_post_moderation_appeal(
  p_appeal_id UUID,
  p_actor_id UUID,
  p_action TEXT,
  p_note TEXT,
  p_independence_exception_reason TEXT DEFAULT NULL,
  p_decided_at TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appeal RECORD;
  v_original_actor_id UUID;
  v_restore_decision_id UUID;
  v_next_status TEXT;
  v_decided_at TIMESTAMPTZ := COALESCE(p_decided_at, now());
BEGIN
  IF p_action NOT IN ('uphold', 'overturn') THEN
    RAISE EXCEPTION 'invalid_appeal_action'
      USING ERRCODE = '22023', HINT = 'p_action must be uphold or overturn.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_actor_id) THEN
    RAISE EXCEPTION 'appeal_actor_not_admin'
      USING ERRCODE = '42501', HINT = 'p_actor_id must exist in admin_users.';
  END IF;

  IF COALESCE(NULLIF(TRIM(p_note), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'appeal_decision_note_required'
      USING ERRCODE = '22023',
            HINT = 'A reason must be given for both uphold and overturn.';
  END IF;

  -- 申立てをロックして冪等性を確保する
  SELECT * INTO v_appeal
  FROM public.post_moderation_appeals
  WHERE id = p_appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 既に判定済みなら何もしない (再送の吸収)
  IF v_appeal.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  -- 元の判定者を引き、同一人物なら例外理由を必須にする
  SELECT actor_id INTO v_original_actor_id
  FROM public.moderation_audit_logs
  WHERE id = v_appeal.removal_decision_id;

  IF v_original_actor_id = p_actor_id
     AND COALESCE(NULLIF(TRIM(p_independence_exception_reason), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'independence_exception_reason_required'
      USING ERRCODE = '22023',
            HINT = 'The original decision maker must record why an independent review was not possible.';
  END IF;

  v_next_status := CASE WHEN p_action = 'overturn' THEN 'overturned' ELSE 'upheld' END;

  UPDATE public.post_moderation_appeals
  SET status = v_next_status,
      decision_note = p_note,
      decided_by = p_actor_id,
      decided_at = v_decided_at,
      independence_exception_reason = p_independence_exception_reason
  WHERE id = p_appeal_id;

  -- 認容時は投稿を復帰し、復帰の監査ログを残す
  IF p_action = 'overturn' THEN
    UPDATE public.generated_images
    SET moderation_status = 'visible',
        moderation_reason = NULL,
        moderation_updated_at = v_decided_at,
        moderation_approved_at = v_decided_at
    WHERE id = v_appeal.post_id;

    INSERT INTO public.moderation_audit_logs (
      post_id, actor_id, action, reason, metadata,
      author_facing_reason, decision_source, automated_means_used, created_at
    ) VALUES (
      v_appeal.post_id,
      p_actor_id,
      'approve',
      NULL,
      jsonb_build_object(
        'appeal_id', p_appeal_id::text,
        'restored_from_decision_id', v_appeal.removal_decision_id::text
      ),
      p_note,
      'appeal_review',
      false,
      v_decided_at
    )
    RETURNING id INTO v_restore_decision_id;
  END IF;

  -- 結果通知は uphold / overturn の両方で送る (REQ-010)
  INSERT INTO public.moderation_notification_outbox (
    event_key,
    moderation_decision_id,
    appeal_id,
    recipient_id,
    notification_type,
    entity_id,
    payload
  ) VALUES (
    'appeal:' || p_appeal_id::text,
    v_appeal.removal_decision_id,
    p_appeal_id,
    v_appeal.appellant_id,
    'post_moderation_appeal_result',
    v_appeal.post_id,
    -- 投稿者に開示してよい項目のみ。審査した運営の ID は載せない。
    jsonb_build_object(
      'moderation_decision_id', v_appeal.removal_decision_id::text,
      'appeal_id', p_appeal_id::text,
      'appeal_status', v_next_status,
      'decision_note', p_note,
      'fallback_title',
        CASE WHEN p_action = 'overturn'
          THEN '異議申立てが認められました'
          ELSE '異議申立ての審査結果をお知らせします' END,
      'fallback_body', p_note
    )
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.decide_post_moderation_appeal IS
  '異議申立ての判定。overturn は投稿復帰・監査ログ・結果 outbox を同一トランザクションで確定する。service_role 専用 (ADR-009)。';

REVOKE ALL ON FUNCTION public.decide_post_moderation_appeal(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_post_moderation_appeal(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.decide_post_moderation_appeal(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ);
-- COMMIT;
--
-- 確定済みの判定・outbox は保持すること (運用データのため)。
-- ===============================================
