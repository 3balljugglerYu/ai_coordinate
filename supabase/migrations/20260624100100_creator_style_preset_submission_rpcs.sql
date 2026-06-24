-- クリエイター提供プロンプト 申請システム(Phase 1): 申請/承認/却下 RPC。
-- 計画書: docs/planning/creator-prompt-submission-plan.md
--
-- DB 層でビジネスルールを強制する(計画 品質観点「DB層での強制」):
--   - 申請者は admin_users もしくは creator_looks_allowlist(is_active) に限る(fail-closed)。
--   - 同意は全項目 true 必須。対応モデルは openai/gemini の非空サブセット、推奨は対応に含むこと。
--   - 申請は status='pending' で作成(公開はされない=RLS で published+public のみ)。
-- 注: 本作業では適用しない方針(ユーザーの指示により、適用は最終確認のうえ一緒に実施する)。

-- 1) 申請: pending の style_preset を作成。
CREATE OR REPLACE FUNCTION public.submit_creator_style_preset(
  p_id UUID,
  p_submitted_by UUID,
  p_title TEXT,
  p_styling_prompt TEXT,
  p_category_id UUID,
  p_thumbnail_image_url TEXT,
  p_thumbnail_storage_path TEXT,
  p_thumbnail_width INTEGER,
  p_thumbnail_height INTEGER,
  p_target_providers TEXT[],
  p_recommended_provider TEXT DEFAULT NULL,
  p_submission_consents JSONB DEFAULT NULL,
  p_background_prompt TEXT DEFAULT NULL
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created public.style_presets;
  v_allowed BOOLEAN;
BEGIN
  -- 呼び出し元アンカー: PostgREST 経由(auth.uid() あり)では本人としてのみ申請可。
  -- service_role 経由(auth.uid() = NULL)は信頼し通す(API がセッションから p_submitted_by を解決)。
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_submitted_by THEN
    RAISE EXCEPTION 'Unauthorized: caller must submit as themselves'
      USING ERRCODE = '42501';
  END IF;

  -- gate: admin_users もしくは creator_looks_allowlist(active)
  SELECT
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_submitted_by)
    OR EXISTS (
      SELECT 1 FROM public.creator_looks_allowlist
      WHERE user_id = p_submitted_by AND is_active = true
    )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'submitter % is not allowed to submit creator prompts', p_submitted_by
      USING ERRCODE = 'check_violation';
  END IF;

  -- 同意(全6項目 true 必須)
  IF p_submission_consents IS NULL
     OR COALESCE((p_submission_consents->>'copyright')::boolean, false) = false
     OR COALESCE((p_submission_consents->>'third_party_ip')::boolean, false) = false
     OR COALESCE((p_submission_consents->>'secondary_use')::boolean, false) = false
     OR COALESCE((p_submission_consents->>'promo_use')::boolean, false) = false
     OR COALESCE((p_submission_consents->>'no_sensitive')::boolean, false) = false
     OR COALESCE((p_submission_consents->>'prompt_original')::boolean, false) = false
  THEN
    RAISE EXCEPTION 'all submission consents must be acknowledged'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 対応モデル / 推奨モデル
  IF p_target_providers IS NULL OR array_length(p_target_providers, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one target provider is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (p_target_providers <@ ARRAY['openai', 'gemini']::text[]) THEN
    RAISE EXCEPTION 'invalid target provider' USING ERRCODE = 'check_violation';
  END IF;
  -- 重複排除(zod と同等。直接 RPC 呼び出しでの二重トリガー防止)。
  IF (
    SELECT count(*) <> count(DISTINCT p) FROM unnest(p_target_providers) AS p
  ) THEN
    RAISE EXCEPTION 'duplicate target provider' USING ERRCODE = 'check_violation';
  END IF;
  IF p_recommended_provider IS NOT NULL
     AND NOT (p_recommended_provider = ANY (p_target_providers)) THEN
    RAISE EXCEPTION 'recommended provider must be one of target providers'
      USING ERRCODE = 'check_violation';
  END IF;

  -- カテゴリ存在確認
  IF NOT EXISTS (SELECT 1 FROM public.preset_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'category not found' USING ERRCODE = 'check_violation';
  END IF;

  -- pending は公開順(sort_order)に並べない。承認時に並べる。
  INSERT INTO public.style_presets (
    id, slug, title, styling_prompt, background_prompt,
    thumbnail_image_url, thumbnail_storage_path, thumbnail_width, thumbnail_height,
    sort_order, status, created_by, updated_by, category_id, image_input_mode,
    dual_reference_source,
    submitted_by_user_id, target_providers, recommended_provider, submission_consents
  )
  VALUES (
    p_id,
    'creator-' || replace(p_id::text, '-', ''),
    p_title,
    p_styling_prompt,
    NULLIF(p_background_prompt, ''),
    p_thumbnail_image_url,
    p_thumbnail_storage_path,
    COALESCE(p_thumbnail_width, 0),
    COALESCE(p_thumbnail_height, 0),
    0,
    'pending',
    p_submitted_by,
    p_submitted_by,
    p_category_id,
    'single',
    'admin',
    p_submitted_by,
    p_target_providers,
    p_recommended_provider,
    p_submission_consents
  )
  RETURNING * INTO v_created;

  RETURN v_created;
END;
$$;

-- 2) 承認: pending → draft、提供者クレジット(provider_user_id)を申請者に設定。公開は運営が後で行う。
CREATE OR REPLACE FUNCTION public.approve_creator_style_preset(
  p_id UUID,
  p_admin UUID
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.style_presets;
BEGIN
  -- 認可: 呼び出し元アンカー + admin_users メンバーシップ(grant_admin_bonus と同パターン)。
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the admin' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_admin) THEN
    RAISE EXCEPTION 'Unauthorized: % is not an authorized admin', p_admin
      USING ERRCODE = '42501';
  END IF;

  -- 承認 = 内容OK + 提供者クレジット設定 + draft 保存。公開タイミングは運営が後で
  -- 通常の編集(draft→published)で決める。よってここでは published にしない。
  UPDATE public.style_presets
  SET
    status = 'draft',
    provider_user_id = COALESCE(provider_user_id, submitted_by_user_id),
    updated_by = p_admin
  WHERE id = p_id AND status = 'pending'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending creator style preset % not found', p_id;
  END IF;

  RETURN v_updated;
END;
$$;

-- 3) 却下: pending → rejected。
CREATE OR REPLACE FUNCTION public.reject_creator_style_preset(
  p_id UUID,
  p_admin UUID
)
RETURNS public.style_presets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.style_presets;
BEGIN
  -- 認可: 呼び出し元アンカー + admin_users メンバーシップ。
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the admin' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_admin) THEN
    RAISE EXCEPTION 'Unauthorized: % is not an authorized admin', p_admin
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.style_presets
  SET status = 'rejected', updated_by = p_admin
  WHERE id = p_id AND status = 'pending'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending creator style preset % not found', p_id;
  END IF;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.submit_creator_style_preset(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT[], TEXT, JSONB, TEXT
) IS 'クリエイター提供プロンプトを pending で申請(allowlist/admin・同意・モデルを DB 層で検証)';
COMMENT ON FUNCTION public.approve_creator_style_preset(UUID, UUID) IS
  'pending の creator style preset を承認(draft 化 + provider_user_id 設定)。公開は運営が後で draft→published で行う';
COMMENT ON FUNCTION public.reject_creator_style_preset(UUID, UUID) IS
  'pending の creator style preset を却下(rejected 化)';

-- 実行権限ロックダウン(リポジトリ規範: SECURITY DEFINER 変更系 RPC は PostgREST 既定公開を遮断し service_role のみに限定)。
REVOKE EXECUTE ON FUNCTION public.submit_creator_style_preset(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT[], TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_creator_style_preset(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT[], TEXT, JSONB, TEXT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.approve_creator_style_preset(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_creator_style_preset(UUID, UUID)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_creator_style_preset(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_creator_style_preset(UUID, UUID)
  TO service_role;
