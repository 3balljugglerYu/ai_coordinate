-- ===============================================
-- Creator Looks: 1 日 2 件投稿 cap
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-011, ADR-007
--
-- クリエイター 1 人あたり過去 24 時間 (= now() - interval '24 hours') に
-- Creator Looks 投稿を 2 件超過させない。アプリ層でも先行 reject するが、
-- DB トリガが最終 backstop。
--
-- 同時 INSERT の race を防ぐため pg_advisory_xact_lock を使用 (既存パターン)。

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

  -- pending への遷移時のみチェック (= draft INSERT 段階では cap を超えていても登録可能、
  --  pending 昇格 RPC で確定的に弾く)
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- UPDATE で OLD.status='pending' のままなら状態遷移ではないのでスキップ
  IF TG_OP = 'UPDATE' AND OLD.moderation_status = NEW.moderation_status THEN
    RETURN NEW;
  END IF;

  -- ユーザー単位の排他ロック
  v_lock_key := hashtextextended(
    'creator_looks_daily_cap:' || NEW.submitted_by_user_id::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 過去 24 時間に pending 以上 (= pending / visible / removed / withdrawn 含む) を Creator Looks 投稿として
  -- promote した件数を数える。created_at 基準で「投稿の意思」を 1 投稿としてカウント。
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_style_templates
  WHERE submitted_by_user_id = NEW.submitted_by_user_id
    AND is_creator_looks = true
    AND moderation_status <> 'draft'
    AND created_at >= now() - interval '24 hours'
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_active_count >= 2 THEN
    RAISE EXCEPTION 'creator_looks_daily_submission_cap_exceeded'
      USING ERRCODE = '23514',  -- check_violation
            HINT = 'Creator Looks submissions are limited to 2 per 24 hours per user.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_creator_looks_daily_cap() IS
  'Creator Looks の 1 日 2 件投稿 cap を強制する trigger 関数。既存 Inspire cap (5 件) とは独立';

DROP TRIGGER IF EXISTS trg_enforce_creator_looks_daily_cap
  ON public.user_style_templates;
CREATE TRIGGER trg_enforce_creator_looks_daily_cap
  BEFORE INSERT OR UPDATE OF moderation_status ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_creator_looks_daily_cap();

REVOKE ALL ON FUNCTION public.enforce_creator_looks_daily_cap() FROM PUBLIC, anon;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_creator_looks_daily_cap ON public.user_style_templates;
-- DROP FUNCTION IF EXISTS public.enforce_creator_looks_daily_cap();
-- COMMIT;
-- ===============================================
