-- ===============================================
-- 判定 RPC の競合・整合性の修正
-- ===============================================
-- レビュー指摘 [P1-2 の判定側] と [P2-1] への対応。
--
-- 【1: 異議認容が「現在有効でない削除判定」でも投稿を復帰させていた】
-- decide_post_moderation_appeal は overturn 時に投稿の現在状態を確認せず、
-- 無条件で visible へ戻していた。作成時のガードを追加しても、申立てが pending の間に
-- 投稿が復帰 → 別理由で再度公開停止された場合、古い申立ての認容が新しい公開停止まで
-- 解除してしまう。判定側でも再検証が必要 (REQ-009 / REQ-011)。
--
-- 対応: 投稿を FOR UPDATE でロックし、申立て対象が
-- current_post_removal_decision_id と一致する場合のみ復帰させる。
-- 一致しない場合は復帰も監査ログも行わず、申立ては「棄却」ではなく
-- 却下不能として FALSE を返し、API 側で 409 にする。
--
-- 【2: 同一 idempotency key の同時再送が冪等なレスポンスにならない】
-- apply_admin_moderation_decision_v2 は「既存判定の SELECT」→「投稿ロック」の順で、
-- 2 リクエストが同時に開始すると両方が SELECT を通過しうる。
-- 先行が更新後、後続はロックを取得して moderation_status <> 'pending' を見て
-- NULL を返し、API は 409 になる。重複更新や通知重複は起きないが、
-- 「同じキーは既存 decision ID を返す」という契約を並行時に満たさない。
--
-- 対応: 投稿ロック取得後、状態判定の前に idempotency key を再検索する。

BEGIN;

-- ── 1. 判定 RPC: ロック後に冪等キーを再検索する ──────────────────
CREATE OR REPLACE FUNCTION public.apply_admin_moderation_decision_v2(
  p_post_id UUID,
  p_actor_id UUID,
  p_action TEXT,
  p_idempotency_key UUID,
  p_policy_code TEXT DEFAULT NULL,
  p_policy_version TEXT DEFAULT NULL,
  p_policy_anchor TEXT DEFAULT NULL,
  p_author_facing_reason TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL,
  p_restriction_scope TEXT DEFAULT 'all_users',
  p_restriction_duration TEXT DEFAULT 'until_reversed',
  p_decision_source TEXT DEFAULT 'admin_review',
  p_automated_means_used BOOLEAN DEFAULT false,
  p_decided_at TIMESTAMPTZ DEFAULT now(),
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_decision_id UUID;
  v_decision_id UUID;
  v_post_user_id UUID;
  v_current_status TEXT;
  v_next_status TEXT;
  v_decided_at TIMESTAMPTZ := COALESCE(p_decided_at, now());
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_moderation_action'
      USING ERRCODE = '22023', HINT = 'p_action must be approve or reject.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_actor_id) THEN
    RAISE EXCEPTION 'moderation_actor_not_admin'
      USING ERRCODE = '42501', HINT = 'p_actor_id must exist in admin_users.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required'
      USING ERRCODE = '22023', HINT = 'p_idempotency_key must be provided.';
  END IF;

  IF p_action = 'reject' THEN
    IF COALESCE(NULLIF(TRIM(p_policy_code), ''), NULL) IS NULL THEN
      RAISE EXCEPTION 'policy_code_required'
        USING ERRCODE = '22023', HINT = 'p_policy_code is required when rejecting.';
    END IF;
    IF COALESCE(NULLIF(TRIM(p_author_facing_reason), ''), NULL) IS NULL THEN
      RAISE EXCEPTION 'author_facing_reason_required'
        USING ERRCODE = '22023', HINT = 'p_author_facing_reason is required when rejecting.';
    END IF;
  END IF;

  -- 早期リターン: 既に同じキーで確定済みなら、その decision id を返す
  SELECT id INTO v_existing_decision_id
  FROM public.moderation_audit_logs
  WHERE action IN ('approve', 'reject')
    AND metadata->>'idempotency_key' = p_idempotency_key::text
  LIMIT 1;

  IF v_existing_decision_id IS NOT NULL THEN
    RETURN v_existing_decision_id;
  END IF;

  -- 対象をロック
  SELECT user_id, moderation_status
    INTO v_post_user_id, v_current_status
  FROM public.generated_images
  WHERE id = p_post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- ロック獲得後に再検索する。
  -- 2 リクエストが同時に開始すると、両方が上の早期リターンを通過しうる。
  -- 先行がコミットした後にここへ来た後続は、既存 decision id を返すべきであり、
  -- 「もう pending ではない」という理由で NULL (=API 409) を返してはならない。
  SELECT id INTO v_existing_decision_id
  FROM public.moderation_audit_logs
  WHERE action IN ('approve', 'reject')
    AND metadata->>'idempotency_key' = p_idempotency_key::text
  LIMIT 1;

  IF v_existing_decision_id IS NOT NULL THEN
    RETURN v_existing_decision_id;
  END IF;

  IF v_current_status IS DISTINCT FROM 'pending' THEN
    RETURN NULL;
  END IF;

  v_next_status := CASE WHEN p_action = 'approve' THEN 'visible' ELSE 'removed' END;

  UPDATE public.generated_images
  SET
    moderation_status = v_next_status,
    moderation_reason = CASE WHEN p_action = 'approve' THEN NULL ELSE p_policy_code END,
    moderation_updated_at = v_decided_at,
    moderation_approved_at = CASE WHEN p_action = 'approve' THEN v_decided_at ELSE NULL END
  WHERE id = p_post_id;

  INSERT INTO public.moderation_audit_logs (
    post_id, actor_id, action, reason, metadata,
    policy_code, policy_version, policy_anchor,
    author_facing_reason, internal_note,
    restriction_scope, restriction_duration,
    decision_source, automated_means_used,
    created_at
  ) VALUES (
    p_post_id,
    p_actor_id,
    p_action,
    CASE WHEN p_action = 'approve' THEN NULL ELSE p_policy_code END,
    COALESCE(p_metadata, '{}'::JSONB)
      || jsonb_build_object('idempotency_key', p_idempotency_key::text),
    p_policy_code,
    p_policy_version,
    p_policy_anchor,
    p_author_facing_reason,
    p_internal_note,
    CASE WHEN p_action = 'reject' THEN p_restriction_scope ELSE NULL END,
    CASE WHEN p_action = 'reject' THEN p_restriction_duration ELSE NULL END,
    p_decision_source,
    COALESCE(p_automated_means_used, false),
    v_decided_at
  )
  RETURNING id INTO v_decision_id;

  IF p_action = 'reject' AND v_post_user_id IS NOT NULL AND v_post_user_id <> p_actor_id THEN
    INSERT INTO public.moderation_notification_outbox (
      event_key, moderation_decision_id, recipient_id,
      notification_type, entity_id, payload
    ) VALUES (
      'removal:' || v_decision_id::text,
      v_decision_id,
      v_post_user_id,
      'post_moderation_removed',
      p_post_id,
      jsonb_build_object(
        'moderation_decision_id', v_decision_id::text,
        'policy_code', p_policy_code,
        'policy_version', p_policy_version,
        'policy_anchor', p_policy_anchor,
        'author_facing_reason', p_author_facing_reason,
        'restriction_scope', p_restriction_scope,
        'restriction_duration', p_restriction_duration,
        'fallback_title', '投稿を公開停止しました',
        'fallback_body', p_author_facing_reason
      )
    )
    ON CONFLICT (event_key) DO NOTHING;
  END IF;

  RETURN v_decision_id;
END;
$$;

-- ── 2. 異議判定 RPC: overturn 時に現在有効な削除判定かを再検証 ──────
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
  v_post_status TEXT;
  v_current_decision_id UUID;
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

  SELECT * INTO v_appeal
  FROM public.post_moderation_appeals
  WHERE id = p_appeal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_appeal.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  SELECT actor_id INTO v_original_actor_id
  FROM public.moderation_audit_logs
  WHERE id = v_appeal.removal_decision_id;

  IF v_original_actor_id = p_actor_id
     AND COALESCE(NULLIF(TRIM(p_independence_exception_reason), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'independence_exception_reason_required'
      USING ERRCODE = '22023',
            HINT = 'The original decision maker must record why an independent review was not possible.';
  END IF;

  -- 投稿をロックしてから現在有効な削除判定を確認する (REQ-009 / REQ-011)。
  -- 申立てが pending の間に投稿が復帰し、別理由で再度公開停止された場合、
  -- 古い申立ての認容が新しい公開停止を解除してしまうため。
  SELECT moderation_status INTO v_post_status
  FROM public.generated_images
  WHERE id = v_appeal.post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_current_decision_id := public.current_post_removal_decision_id(v_appeal.post_id);

  IF p_action = 'overturn'
     AND v_current_decision_id IS DISTINCT FROM v_appeal.removal_decision_id THEN
    -- 対象が現在有効な公開停止でない。復帰させると別の判定を解除してしまうため、
    -- 何も変更せず FALSE を返して API 側で 409 にする。
    RAISE EXCEPTION 'appeal_target_not_current_removal'
      USING ERRCODE = '22023',
            HINT = 'The appealed decision is no longer the effective removal for this post.';
  END IF;

  v_next_status := CASE WHEN p_action = 'overturn' THEN 'overturned' ELSE 'upheld' END;

  UPDATE public.post_moderation_appeals
  SET status = v_next_status,
      decision_note = p_note,
      decided_by = p_actor_id,
      decided_at = v_decided_at,
      independence_exception_reason = p_independence_exception_reason
  WHERE id = p_appeal_id;

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
    );
  END IF;

  INSERT INTO public.moderation_notification_outbox (
    event_key, moderation_decision_id, appeal_id, recipient_id,
    notification_type, entity_id, payload
  ) VALUES (
    'appeal:' || p_appeal_id::text,
    v_appeal.removal_decision_id,
    p_appeal_id,
    v_appeal.appellant_id,
    'post_moderation_appeal_result',
    v_appeal.post_id,
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

COMMIT;

-- ===============================================
-- DOWN:
-- 直前のバージョン (20260728130300 / 20260728130500) の CREATE OR REPLACE を
-- 再適用すれば戻るが、いずれも整合性の緩和方向なので推奨しない。
-- ===============================================
