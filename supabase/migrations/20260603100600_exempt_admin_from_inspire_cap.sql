-- ===============================================
-- Inspire 投稿数 cap (5 件) から admin / Creator Looks allowlist を除外
-- ===============================================
-- 設計判断:
--   運営者 (admin_users) と Stage 2 招待クリエイター (creator_looks_allowlist 内の
--   is_active=true) は動作確認・運用テストで投稿を繰り返すため、
--   既存 Inspire 5 件 cap の対象外とする。
--
-- 変更点:
--   既存 enforce_user_style_template_submission_cap 関数の早期 return 条件に追加:
--     - admin_users に登録されている user は cap 対象外
--     - creator_looks_allowlist (is_active=true) に登録されている user も cap 対象外
--   それ以外のロジックは元 (20260602100900) と同じ。

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_user_style_template_submission_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_lock_key BIGINT;
BEGIN
  -- pending への遷移時のみチェック
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- UPDATE で OLD.status='pending' のままなら状態遷移ではないのでスキップ
  IF TG_OP = 'UPDATE' AND OLD.moderation_status = NEW.moderation_status THEN
    RETURN NEW;
  END IF;

  -- Creator Looks 投稿は別 cap (= 1 日 2 件、API 層) で管理するため、ここでは素通し
  IF NEW.is_creator_looks = true THEN
    RETURN NEW;
  END IF;

  -- admin_users に登録された運営者は cap 対象外
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = NEW.submitted_by_user_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Stage 2 招待クリエイター (creator_looks_allowlist.is_active=true) も cap 対象外
  IF EXISTS (
    SELECT 1 FROM public.creator_looks_allowlist
    WHERE user_id = NEW.submitted_by_user_id
      AND is_active = true
  ) THEN
    RETURN NEW;
  END IF;

  -- ユーザー単位の排他ロック（同一ユーザーからの 2 並列 submit を防ぐ）
  v_lock_key := hashtextextended('user_style_template_cap:' || NEW.submitted_by_user_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Inspire のみカウント (= Creator Looks 行は除外)
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_style_templates
  WHERE submitted_by_user_id = NEW.submitted_by_user_id
    AND moderation_status IN ('pending', 'visible')
    AND is_creator_looks = false
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'user_style_template_submission_cap_exceeded'
      USING ERRCODE = '23514',  -- check_violation
            HINT = 'A user can have at most 5 templates in pending or visible state.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_user_style_template_submission_cap() IS
  'Inspire 投稿の cap (5 件) を強制する trigger 関数。admin_users / creator_looks_allowlist(is_active) と Creator Looks 投稿は対象外';

COMMIT;

-- ===============================================
-- DOWN: 20260602100900 時点の定義 (admin/allowlist 除外なし) に戻す
-- ===============================================
