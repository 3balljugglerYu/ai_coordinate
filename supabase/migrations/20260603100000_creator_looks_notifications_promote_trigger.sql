-- ===============================================
-- Creator Looks 通知 Trigger 1: 投稿受付 (通知 A + B)
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-002, ADR-004
--
-- 発火条件:
--   user_style_templates AFTER UPDATE OF moderation_status
--   かつ OLD.moderation_status = 'draft' AND NEW.moderation_status = 'pending'
--   かつ NEW.is_creator_looks = true
--
-- 通知:
--   A: admin 全員 (投稿者本人除外) に 'creator_looks_submission_received'
--      create_notification_bulk 経由
--   B: 投稿者本人に 'creator_looks_submission_acknowledged'
--      create_creator_looks_self_notification 経由 (= 既存 create_notification は self-skip するため)
--
-- 失敗時:
--   EXCEPTION を握り潰し、style_template_audit_logs に metadata で記録 (= ADR-004)
--   通知失敗で user_style_templates の状態遷移を ROLLBACK しない

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_creator_looks_on_pending_promotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_ids UUID[];
  v_submitter_nickname TEXT;
  v_title_a TEXT;
  v_body_a TEXT;
  v_title_b TEXT;
  v_body_b TEXT;
BEGIN
  -- Creator Looks 投稿以外は no-op
  IF NEW.is_creator_looks IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- 状態遷移ガード: draft → pending のときだけ発火
  IF OLD.moderation_status IS NOT DISTINCT FROM NEW.moderation_status THEN
    RETURN NEW;
  END IF;
  IF NOT (OLD.moderation_status = 'draft' AND NEW.moderation_status = 'pending') THEN
    RETURN NEW;
  END IF;

  -- 投稿者ニックネーム取得 (= 通知本文用)
  SELECT nickname INTO v_submitter_nickname
  FROM public.profiles
  WHERE user_id = NEW.submitted_by_user_id;
  v_submitter_nickname := COALESCE(NULLIF(v_submitter_nickname, ''), 'ユーザー');

  -- 通知 A: admin 全員に「新規投稿あり」
  -- 投稿者本人が admin の場合は create_notification 経由で自己通知を skip するロジックを通すため、
  -- bulk RPC 側のループで丁寧にスキップする (= bulk 関数内で recipient = actor の場合は CONTINUE)
  v_title_a := 'Creator Looks に新規投稿があります';
  v_body_a := v_submitter_nickname || ' さんから新規投稿「' ||
              COALESCE(NULLIF(NEW.alt, ''), '無題') || '」が届きました。承認をお願いします。';

  BEGIN
    SELECT array_agg(user_id) INTO v_admin_ids
    FROM public.admin_users;

    IF v_admin_ids IS NOT NULL AND cardinality(v_admin_ids) > 0 THEN
      PERFORM public.create_notification_bulk(
        v_admin_ids,
        NEW.submitted_by_user_id,
        'creator_looks_submission_received',
        'creator_looks_template',
        NEW.id,
        v_title_a,
        v_body_a,
        jsonb_build_object('template_id', NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.style_template_audit_logs (template_id, actor_id, action, reason, metadata)
    VALUES (NEW.id, NEW.submitted_by_user_id, 'submit',
            'notify_admin_failed', jsonb_build_object('error', SQLERRM));
  END;

  -- 通知 B: 投稿者本人に「投稿を受け付けました」
  v_title_b := '投稿を受け付けました';
  v_body_b := '「' || COALESCE(NULLIF(NEW.alt, ''), '無題') ||
              '」の投稿を受け付けました。運営による確認をお待ちください (通常 24 時間以内)。';

  BEGIN
    PERFORM public.create_creator_looks_self_notification(
      NEW.submitted_by_user_id,
      NEW.id,
      v_title_b,
      v_body_b,
      jsonb_build_object('template_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.style_template_audit_logs (template_id, actor_id, action, reason, metadata)
    VALUES (NEW.id, NEW.submitted_by_user_id, 'submit',
            'notify_submitter_failed', jsonb_build_object('error', SQLERRM));
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_creator_looks_on_pending_promotion() IS
  'Creator Looks 投稿の draft → pending 遷移時に通知 A (admin) + B (submitter) を発火する trigger 関数';

DROP TRIGGER IF EXISTS trg_notify_creator_looks_on_pending_promotion
  ON public.user_style_templates;
CREATE TRIGGER trg_notify_creator_looks_on_pending_promotion
  AFTER UPDATE OF moderation_status ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_creator_looks_on_pending_promotion();

REVOKE ALL ON FUNCTION public.notify_creator_looks_on_pending_promotion()
  FROM PUBLIC, anon;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_creator_looks_on_pending_promotion ON public.user_style_templates;
-- DROP FUNCTION IF EXISTS public.notify_creator_looks_on_pending_promotion();
-- COMMIT;
-- ===============================================
