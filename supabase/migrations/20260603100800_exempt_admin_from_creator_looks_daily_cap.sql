-- ===============================================
-- Creator Looks 1 日 2 件 cap (DB Trigger) から admin / allowlist を除外
-- ===============================================
-- 背景:
--   PR #303 (20260603100600) で Inspire 5 件 cap Trigger と
--   preview-generation handler (Creator Looks daily cap の API 層) は admin/allowlist
--   除外を追加したが、Creator Looks daily cap の DB Trigger
--   (enforce_creator_looks_daily_cap) は除外漏れだった。
--   この Trigger は promote_user_style_template_draft RPC 経由 (= submissions API)
--   での pending 昇格時に発火し、admin が API 層を通過しても DB 層で reject される。
--
-- 修正:
--   enforce_creator_looks_daily_cap 関数の早期 return に admin_users / creator_looks_allowlist
--   チェックを追加 (= 20260603100600 と同じパターン)。

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_creator_looks_daily_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_lock_key BIGINT;
BEGIN
  -- Creator Looks 投稿でないなら何もしない
  IF NEW.is_creator_looks = false THEN
    RETURN NEW;
  END IF;

  -- pending への遷移時のみチェック
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- UPDATE で OLD.status='pending' のままなら状態遷移ではないのでスキップ
  IF TG_OP = 'UPDATE' AND OLD.moderation_status = NEW.moderation_status THEN
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

  -- ユーザー単位の排他ロック
  v_lock_key := hashtextextended(
    'creator_looks_daily_cap:' || NEW.submitted_by_user_id::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COUNT(*) INTO v_active_count
  FROM public.user_style_templates
  WHERE submitted_by_user_id = NEW.submitted_by_user_id
    AND is_creator_looks = true
    AND moderation_status <> 'draft'
    AND created_at >= now() - interval '24 hours'
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_active_count >= 2 THEN
    RAISE EXCEPTION 'creator_looks_daily_submission_cap_exceeded'
      USING ERRCODE = '23514',
            HINT = 'Creator Looks submissions are limited to 2 per 24 hours per user.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_creator_looks_daily_cap() IS
  'Creator Looks の 1 日 2 件投稿 cap を強制する trigger 関数。admin_users / creator_looks_allowlist(is_active) は対象外';

COMMIT;
