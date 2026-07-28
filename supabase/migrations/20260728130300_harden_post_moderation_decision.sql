-- ===============================================
-- 判定 RPC v2: 権限是正・冪等性・outbox 結合
-- ===============================================
-- 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
--           ADR-001, ADR-009, ADR-011 / REQ-001, REQ-018, REQ-024, REQ-025
--
-- 【既存 v1 の問題】
-- apply_admin_moderation_decision は SECURITY DEFINER でありながら
-- 本番 ACL 実測で anon / authenticated に EXECUTE が付いており、
-- p_actor_id が admin かを DB 内で検証していない。
-- つまり一般ユーザーが任意の投稿を approve / reject でき、
-- 監査ログの actor も偽装できる状態だった。
--
-- 【v2 の変更点】
--   1. service_role 専用 (anon / authenticated / PUBLIC を REVOKE)
--   2. p_actor_id を admin_users で fail-closed に検証
--   3. p_idempotency_key による再送耐性 (同一キーは既存 decision id を返す)
--   4. 対象を FOR UPDATE でロックし、pending のときだけ適用
--   5. reject 時は policy_code と author_facing_reason を必須化
--   6. 判定・監査ログ・通知 outbox を同一トランザクションで確定
--
-- v1 は削除せず権限のみ剥奪する。既存の呼出元 (判定 API) は service_role の
-- createAdminClient() 経由のため、REVOKE しても動作は変わらない。

BEGIN;

-- 冪等キーの一意性。approve / reject に限定した部分 UNIQUE index。
CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_audit_idempotency_key
  ON public.moderation_audit_logs ((metadata->>'idempotency_key'))
  WHERE action IN ('approve', 'reject');

-- ── v1 の権限是正 ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.apply_admin_moderation_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_moderation_decision(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO service_role;

-- ── v2 ────────────────────────────────────────────────────────
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

  -- DB 側でも admin を fail-closed に検証する (API の requireAdmin と二重防御)
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_actor_id) THEN
    RAISE EXCEPTION 'moderation_actor_not_admin'
      USING ERRCODE = '42501', HINT = 'p_actor_id must exist in admin_users.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required'
      USING ERRCODE = '22023', HINT = 'p_idempotency_key must be provided.';
  END IF;

  -- reject は投稿者への説明責任があるため、ポリシーと投稿者向け説明を必須にする
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

  -- 再送の吸収: 同じ冪等キーの判定が既にあれば、その decision id を返す
  SELECT id INTO v_existing_decision_id
  FROM public.moderation_audit_logs
  WHERE action IN ('approve', 'reject')
    AND metadata->>'idempotency_key' = p_idempotency_key::text
  LIMIT 1;

  IF v_existing_decision_id IS NOT NULL THEN
    RETURN v_existing_decision_id;
  END IF;

  -- 対象をロックしてから状態を確認する (並行判定の二重適用を防ぐ)
  SELECT user_id, moderation_status
    INTO v_post_user_id, v_current_status
  FROM public.generated_images
  WHERE id = p_post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 審査キューからの判定は pending のときだけ適用する
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

  -- reject のみ投稿者へ通知する (approve / pending は通知しない: REQ-003, REQ-004)。
  -- 判定者が投稿者本人の場合はスキップする (REQ-005)。
  IF p_action = 'reject' AND v_post_user_id IS NOT NULL AND v_post_user_id <> p_actor_id THEN
    INSERT INTO public.moderation_notification_outbox (
      event_key,
      moderation_decision_id,
      recipient_id,
      notification_type,
      entity_id,
      payload
    ) VALUES (
      'removal:' || v_decision_id::text,
      v_decision_id,
      v_post_user_id,
      'post_moderation_removed',
      p_post_id,
      -- 投稿者に開示してよい項目のみ。internal_note / 通報件数 / 通報者情報は載せない。
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

COMMENT ON FUNCTION public.apply_admin_moderation_decision_v2 IS
  '審査キューからの approve / reject を適用し、監査ログと通知 outbox を同一トランザクションで確定する。service_role 専用 (ADR-009)。';

REVOKE ALL ON FUNCTION public.apply_admin_moderation_decision_v2(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_moderation_decision_v2(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, JSONB
) TO service_role;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.apply_admin_moderation_decision_v2(
--   UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, JSONB);
-- DROP INDEX IF EXISTS public.uq_moderation_audit_idempotency_key;
-- COMMIT;
--
-- 注意: v1 への anon / authenticated 権限の再付与は行わない (脆弱性の再導入)。
-- API を v1 に戻す場合も service_role 経由での呼び出しを維持すること。
-- ===============================================
