-- ===============================================
-- enqueue_creator_looks_extraction RPC + promote RPC 拡張
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-003, ADR-011
--
-- enqueue_creator_looks_extraction(p_template_id):
--   pg_net 経由で Edge Function extract-creator-looks-prompt を非同期起動する。
--   vault.decrypted_secrets から creator_looks_extract_secret を取得し
--   Authorization: Bearer <secret> ヘッダを付ける (既存 cron migration と同じ vault パターン)。
--   secret 未設定なら起動はしない (= Phase 1 では Vault 未設定状態、Phase 2 以降で実体化)。
--
-- promote_user_style_template_draft 拡張:
--   Creator Looks 投稿のとき draft → pending 昇格後に enqueue_creator_looks_extraction を呼ぶ。
--   pg_net は別トランザクションでコミット後に HTTP 発火するため、promote が ROLLBACK されれば
--   enqueue も飛ばない (= 整合性自動保証)。
--
-- Phase 1 ではマイグレーション本体のみ整備し、Vault secret / Edge Function は Phase 2 で実体化する。

BEGIN;

-- ===============================================
-- 1) enqueue_creator_looks_extraction
-- ===============================================
-- 戻り値: BOOLEAN
--   TRUE  = pg_net への submit に成功 (= HTTP 発火は別トランザクション)
--   FALSE = secret 未設定 or pg_net 拡張未有効 など (= スキップ、ログのみ残す)

CREATE OR REPLACE FUNCTION public.enqueue_creator_looks_extraction(
  p_template_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_function_url TEXT := 'https://hnrccaxrvhtbuihfvitc.supabase.co/functions/v1/extract-creator-looks-prompt';
  v_headers JSONB;
  v_body JSONB;
  v_caller_id UUID := auth.uid();
  v_template_owner_id UUID;
  v_is_creator_looks BOOLEAN;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT submitted_by_user_id, is_creator_looks
  INTO v_template_owner_id, v_is_creator_looks
  FROM public.user_style_templates
  WHERE id = p_template_id;

  IF v_template_owner_id IS NULL OR v_is_creator_looks IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF v_caller_id IS NOT NULL
     AND v_template_owner_id <> v_caller_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.admin_users
       WHERE user_id = v_caller_id
     ) THEN
    RAISE EXCEPTION 'creator_looks_enqueue_not_authorized'
      USING ERRCODE = '42501';
  END IF;

  -- Vault から secret を取得 (= 既存 cron migration と同じパターン)
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'creator_looks_extract_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    -- Vault 未設定: Phase 1 ではここで早期 return (= Phase 2 で secret を設定後に発火)
    RAISE NOTICE 'creator_looks_extract_secret is not set in vault; extraction will not be enqueued';
    RETURN false;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );

  v_body := jsonb_build_object('template_id', p_template_id);

  -- pg_net 経由で Edge Function を非同期起動
  -- (= 例外時はキャッチして失敗ログのみ。promote 本体を ROLLBACK させない)
  BEGIN
    PERFORM net.http_post(
      url := v_function_url,
      headers := v_headers,
      body := v_body,
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_creator_looks_extraction: net.http_post failed for template %: %',
      p_template_id, SQLERRM;
    RETURN false;
  END;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.enqueue_creator_looks_extraction(UUID) IS
  'Creator Looks の meta-prompt 抽出 Edge Function を pg_net 経由で非同期起動する RPC。Vault secret 未設定なら no-op';

-- 通常 authenticated user は直接呼ばない (= promote RPC 内から呼ばれる)。
-- SECURITY DEFINER 内部呼び出しで足りるため、直接 EXECUTE は公開しない。
REVOKE ALL ON FUNCTION public.enqueue_creator_looks_extraction(UUID) FROM PUBLIC, anon, authenticated;

-- ===============================================
-- 2) promote_user_style_template_draft 拡張
-- ===============================================
-- Creator Looks 投稿のときに enqueue を併せて呼ぶ。

CREATE OR REPLACE FUNCTION public.promote_user_style_template_draft(
  p_template_id UUID,
  p_actor_id UUID,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_id THEN
    RAISE EXCEPTION 'unauthorized_actor'
      USING ERRCODE = '42501';
  END IF;

  -- 行の取得（所有者検証込み）+ Creator Looks フラグも取得
  SELECT id, submitted_by_user_id, moderation_status, image_url, storage_path, is_creator_looks
  INTO v_template
  FROM public.user_style_templates
  WHERE id = p_template_id
    AND submitted_by_user_id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_style_template_not_found_or_not_owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_template.moderation_status <> 'draft' THEN
    RAISE EXCEPTION 'user_style_template_not_in_draft'
      USING ERRCODE = '22023', HINT = 'Only draft rows can be promoted to pending.';
  END IF;

  IF v_template.image_url IS NULL OR v_template.storage_path IS NULL THEN
    RAISE EXCEPTION 'user_style_template_missing_image'
      USING ERRCODE = '22023', HINT = 'Template image must be uploaded before promotion.';
  END IF;

  -- draft → pending 昇格 + 同意タイムスタンプを now() で記録
  UPDATE public.user_style_templates
  SET
    moderation_status     = 'pending',
    moderation_updated_at = v_now,
    copyright_consent_at  = v_now
  WHERE id = p_template_id;

  -- 監査ログ
  INSERT INTO public.style_template_audit_logs (
    template_id,
    actor_id,
    action,
    metadata
  ) VALUES (
    p_template_id,
    p_actor_id,
    'submit',
    COALESCE(p_metadata, '{}'::JSONB)
  );

  -- Creator Looks 投稿のときは meta-prompt 抽出ジョブを非同期 enqueue
  -- (= pg_net 経由なのでトランザクションコミット後に発火、ROLLBACK 時は飛ばない)
  IF v_template.is_creator_looks = true THEN
    PERFORM public.enqueue_creator_looks_extraction(p_template_id);
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.promote_user_style_template_draft(UUID, UUID, JSONB) IS
  'draft → pending 昇格 + 同意タイムスタンプ記録 + Creator Looks 投稿の場合は meta-prompt 抽出を非同期 enqueue';

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- (元の promote_user_style_template_draft 定義に戻す)
-- DROP FUNCTION IF EXISTS public.enqueue_creator_looks_extraction(UUID);
-- COMMIT;
-- ===============================================
