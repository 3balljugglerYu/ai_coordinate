-- ===============================================
-- Creator Looks: admin 用 preview 自動生成 Trigger
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md (admin preview 追加)
--
-- フロー:
--   1. ユーザー申請 → submissions API → promote RPC → extract-creator-looks-prompt Edge Function (= 既存)
--   2. Edge Function: hidden_prompt 抽出 → user_style_template_secrets に UPSERT
--   3. 本 Trigger: secrets テーブル INSERT/UPDATE を捕捉
--   4. enqueue_creator_looks_admin_preview RPC: Vault secret + pg_net で Next.js API を非同期 POST
--   5. Next.js API: hidden_prompt + テストキャラ画像 + OpenAI/Gemini で 2 枚生成 → DB UPDATE
--   6. admin/style-templates: 既存 preview 枠で表示
--
-- 注意:
--   - Next.js API URL は本番固定 (= https://www.persta.ai)。preview/staging 環境では呼ばれない
--     (= 必要なら別途 Vault に URL を保存して動的解決する設計に変える)
--   - Bearer 認証は既存 Vault `creator_looks_extract_secret` を流用 (= Vercel env EDGE_FUNCTION_SECRET と同じ値)
--   - 失敗時は WARNING ログのみ、関数本体の return は true (= INSERT 自体は成功扱い)

BEGIN;

-- ===============================================
-- 1) enqueue_creator_looks_admin_preview RPC
-- ===============================================

CREATE OR REPLACE FUNCTION public.enqueue_creator_looks_admin_preview(
  p_template_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_function_url TEXT := 'https://www.persta.ai/api/internal/generate-creator-looks-admin-preview';
  v_headers JSONB;
  v_body JSONB;
  v_is_creator_looks BOOLEAN;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN false;
  END IF;

  -- 防御: Creator Looks 投稿でなければ no-op
  SELECT is_creator_looks INTO v_is_creator_looks
  FROM public.user_style_templates
  WHERE id = p_template_id;
  IF v_is_creator_looks IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  -- Vault から secret を取得 (= 既存 enqueue_creator_looks_extraction と同じパターン)
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'creator_looks_extract_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE 'creator_looks_extract_secret is not set in vault; admin preview will not be enqueued';
    RETURN false;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );

  v_body := jsonb_build_object('template_id', p_template_id);

  -- pg_net で Next.js API を非同期 POST
  -- timeout は OpenAI/Gemini の並列実行 (= 最大 90 秒) + バッファ
  BEGIN
    PERFORM net.http_post(
      url := v_function_url,
      headers := v_headers,
      body := v_body,
      timeout_milliseconds := 120000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_creator_looks_admin_preview: net.http_post failed for template %: %',
      p_template_id, SQLERRM;
    RETURN false;
  END;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.enqueue_creator_looks_admin_preview(UUID) IS
  'Creator Looks の admin 用 preview (OpenAI/Gemini で着せ替え画像 2 枚) を pg_net 経由で Next.js API に非同期 POST する';

-- authenticated user からは直接呼ばない (= Trigger 内部呼び出し限定)
REVOKE ALL ON FUNCTION public.enqueue_creator_looks_admin_preview(UUID) FROM PUBLIC, anon, authenticated;

-- ===============================================
-- 2) Trigger function: secrets INSERT/UPDATE を捕捉
-- ===============================================

CREATE OR REPLACE FUNCTION public.handle_creator_looks_secrets_change_for_preview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- INSERT または hidden_prompt が変化した UPDATE の時に admin preview を再生成
  IF TG_OP = 'INSERT' OR
     (TG_OP = 'UPDATE' AND NEW.hidden_prompt IS DISTINCT FROM OLD.hidden_prompt) THEN
    PERFORM public.enqueue_creator_looks_admin_preview(NEW.template_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_creator_looks_secrets_change_for_preview() IS
  'user_style_template_secrets の INSERT または hidden_prompt 変化時に admin preview 生成を enqueue する Trigger 関数';

-- ===============================================
-- 3) Trigger 定義
-- ===============================================
-- idempotent: 既存 Trigger を消してから作る

DROP TRIGGER IF EXISTS trg_creator_looks_secrets_admin_preview
  ON public.user_style_template_secrets;

CREATE TRIGGER trg_creator_looks_secrets_admin_preview
AFTER INSERT OR UPDATE ON public.user_style_template_secrets
FOR EACH ROW
EXECUTE FUNCTION public.handle_creator_looks_secrets_change_for_preview();

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_creator_looks_secrets_admin_preview
--   ON public.user_style_template_secrets;
-- DROP FUNCTION IF EXISTS public.handle_creator_looks_secrets_change_for_preview();
-- DROP FUNCTION IF EXISTS public.enqueue_creator_looks_admin_preview(UUID);
-- COMMIT;
-- ===============================================
