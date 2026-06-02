-- ===============================================
-- Creator Looks: DB guard triggers (cross-table 不変条件)
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-013, REQ-004, REQ-016
--
-- PostgreSQL CHECK 制約は subquery / cross-table 参照を使えない。
-- このため以下の不変条件は BEFORE INSERT/UPDATE トリガで強制する:
--   1. is_creator_looks=true の投稿者が admin_users または creator_looks_allowlist (is_active=true) に
--      含まれること (pending/visible 状態のみ強制、draft は許可)
--   2. moderation_status='visible' への遷移時に user_style_template_secrets.hidden_prompt が
--      存在することを EXISTS で確認
--
-- 通常の API 経路は API 層 + RPC 内でも検証するが、DB トリガが最終 backstop となる。
-- これにより SQL を直接叩かれても reject される (= 二重ガード)。

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_creator_looks_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Creator Looks 投稿でないなら何もしない (= 既存 Inspire 投稿の挙動は変えない)
  IF NEW.is_creator_looks = false THEN
    RETURN NEW;
  END IF;

  -- draft は緩く (まだ投稿確定していない状態)
  IF NEW.moderation_status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- pending 以降は投稿者が admin または allowlist (is_active=true) に含まれていること
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = NEW.submitted_by_user_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.creator_looks_allowlist
    WHERE user_id = NEW.submitted_by_user_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'creator_looks_submitter_not_authorized'
      USING ERRCODE = '42501',
            HINT = 'Submitter must be in admin_users or active creator_looks_allowlist to use Creator Looks.';
  END IF;

  -- visible 状態に遷移するなら hidden_prompt が必須
  -- (= 抽出が完了していない投稿を承認できないようにする backstop)
  IF NEW.moderation_status = 'visible' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_style_template_secrets
      WHERE template_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'creator_looks_hidden_prompt_not_ready'
        USING ERRCODE = '22023',
              HINT = 'hidden_prompt must be generated before transitioning to visible.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_creator_looks_invariants() IS
  'Creator Looks の cross-table 不変条件 (admin/allowlist + hidden_prompt 存在) を強制する BEFORE トリガ関数。CHECK では表現不可能な subquery 条件をここで担保する';

DROP TRIGGER IF EXISTS trg_enforce_creator_looks_invariants_insert
  ON public.user_style_templates;
CREATE TRIGGER trg_enforce_creator_looks_invariants_insert
  BEFORE INSERT ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_creator_looks_invariants();

DROP TRIGGER IF EXISTS trg_enforce_creator_looks_invariants_update
  ON public.user_style_templates;
CREATE TRIGGER trg_enforce_creator_looks_invariants_update
  BEFORE UPDATE OF is_creator_looks, moderation_status, submitted_by_user_id
  ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_creator_looks_invariants();

REVOKE ALL ON FUNCTION public.enforce_creator_looks_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_looks_invariants() FROM anon;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_enforce_creator_looks_invariants_update ON public.user_style_templates;
-- DROP TRIGGER IF EXISTS trg_enforce_creator_looks_invariants_insert ON public.user_style_templates;
-- DROP FUNCTION IF EXISTS public.enforce_creator_looks_invariants();
-- COMMIT;
-- ===============================================
