-- クリエイター提供プロンプト 申請(Phase 3): pending の creator style_preset に対する
-- admin 用 preview(OpenAI/Gemini)自動生成を enqueue する Trigger。
-- 計画書: docs/planning/creator-prompt-submission-plan.md
--
-- フロー:
--   1. 申請API → submit_creator_style_preset RPC → style_presets に status='pending' で INSERT
--   2. 本 Trigger: INSERT(status='pending' かつ submitted_by_user_id あり=クリエイター提供)を捕捉
--   3. enqueue_creator_style_preset_preview RPC: Vault secret + pg_net で Next.js API を非同期 POST
--   4. Next.js API(/api/internal/generate-style-preset-preview): styling_prompt + 運営テスト画像 +
--      target_providers で生成 → style_presets.preview_*_image_url を UPDATE
--   5. /admin/style-presets: preview を表示し審査
--
-- 注意(既存 admin-preview Trigger と同方針):
--   - Next.js API URL は本番固定(preview/staging では呼ばれない)
--   - Bearer 認証は既存 Vault `creator_looks_extract_secret`(= Vercel env EDGE_FUNCTION_SECRET)を流用
--   - 失敗時は WARNING ログのみ、INSERT 自体は成功扱い
-- 注: 本作業では適用しない方針(ユーザーの指示により、適用は最終確認のうえ一緒に実施する)。

BEGIN;

-- 1) enqueue RPC
CREATE OR REPLACE FUNCTION public.enqueue_creator_style_preset_preview(
  p_preset_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_function_url TEXT := 'https://www.persta.ai/api/internal/generate-style-preset-preview';
  v_headers JSONB;
  v_body JSONB;
  v_submitter UUID;
  v_status TEXT;
BEGIN
  IF p_preset_id IS NULL THEN
    RETURN false;
  END IF;

  -- 防御: クリエイター提供(submitted_by_user_id あり)かつ pending のみ対象。
  SELECT submitted_by_user_id, status INTO v_submitter, v_status
  FROM public.style_presets
  WHERE id = p_preset_id;
  IF v_submitter IS NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RETURN false;
  END IF;

  -- Vault から secret 取得(既存 admin-preview と同じ secret を流用)。
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'creator_looks_extract_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE 'creator_looks_extract_secret is not set in vault; style preset preview will not be enqueued';
    RETURN false;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );
  v_body := jsonb_build_object('preset_id', p_preset_id);

  BEGIN
    PERFORM net.http_post(
      url := v_function_url,
      headers := v_headers,
      body := v_body,
      timeout_milliseconds := 120000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_creator_style_preset_preview: net.http_post failed for preset %: %',
      p_preset_id, SQLERRM;
    RETURN false;
  END;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.enqueue_creator_style_preset_preview(UUID) IS
  'pending の creator style_preset の admin 用 preview(OpenAI/Gemini)を pg_net 経由で Next.js API に非同期 POST する';

REVOKE ALL ON FUNCTION public.enqueue_creator_style_preset_preview(UUID)
  FROM PUBLIC, anon, authenticated;

-- 2) Trigger 関数: INSERT(pending かつ creator 提供)を捕捉
CREATE OR REPLACE FUNCTION public.handle_creator_style_preset_pending_for_preview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.submitted_by_user_id IS NOT NULL AND NEW.status = 'pending' THEN
    PERFORM public.enqueue_creator_style_preset_preview(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_creator_style_preset_pending_for_preview() IS
  'style_presets に creator 提供の pending 行が作られた時に admin preview 生成を enqueue する Trigger 関数';

-- 3) Trigger 定義(idempotent)
DROP TRIGGER IF EXISTS trg_creator_style_preset_pending_preview
  ON public.style_presets;

CREATE TRIGGER trg_creator_style_preset_pending_preview
AFTER INSERT ON public.style_presets
FOR EACH ROW
EXECUTE FUNCTION public.handle_creator_style_preset_pending_for_preview();

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_creator_style_preset_pending_preview ON public.style_presets;
-- DROP FUNCTION IF EXISTS public.handle_creator_style_preset_pending_for_preview();
-- DROP FUNCTION IF EXISTS public.enqueue_creator_style_preset_preview(UUID);
-- COMMIT;
-- ===============================================
