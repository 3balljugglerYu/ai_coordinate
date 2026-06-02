-- ===============================================
-- Creator Looks 通知 Trigger 2: 承認 / 却下 (通知 C)
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-004, REQ-005, ADR-004
--
-- 発火条件:
--   user_style_templates AFTER UPDATE OF moderation_status
--   かつ NEW.is_creator_looks = true
--   かつ OLD.moderation_status IS DISTINCT FROM NEW.moderation_status (= 冪等性ガード、D-1)
--   かつ NEW.moderation_status IN ('visible', 'removed')
--   (= visible = 承認、removed = 却下 / 非公開化)
--
-- 通知:
--   投稿者本人に 'creator_looks_moderation_result'
--   data.action = 'approved' or 'rejected' で区別
--   create_notification 経由 (= 投稿者本人への通知だが、actor は decided_by の admin なので self-skip しない)

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_creator_looks_on_moderation_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_title TEXT;
  v_body TEXT;
  v_actor_id UUID;
BEGIN
  -- Creator Looks 投稿以外は no-op
  IF NEW.is_creator_looks IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- 冪等性ガード: 同じ status への再 UPDATE は無視
  IF OLD.moderation_status IS NOT DISTINCT FROM NEW.moderation_status THEN
    RETURN NEW;
  END IF;

  -- 対象遷移のみ発火 (= visible / removed)
  IF NEW.moderation_status NOT IN ('visible', 'removed') THEN
    RETURN NEW;
  END IF;

  -- action: visible = approved, removed = rejected
  -- removed への遷移は「却下」と「公開後の非公開化」の両方が含まれるが、
  -- 投稿者視点では「審査結果」として同じ通知 type で扱う (= UX 上の単純化)
  IF NEW.moderation_status = 'visible' THEN
    v_action := 'approved';
    v_title := '投稿が公開されました 🎉';
    v_body := '「' || COALESCE(NULLIF(NEW.alt, ''), '無題') ||
              '」が公開され、みんなが使えるようになりました。';
  ELSE
    v_action := 'rejected';
    v_title := '投稿について確認のお願い';
    v_body := '「' || COALESCE(NULLIF(NEW.alt, ''), '無題') ||
              '」の公開を見送らせていただきました。' ||
              CASE
                WHEN NEW.moderation_reason IS NOT NULL AND NEW.moderation_reason <> ''
                THEN ' 理由: ' || NEW.moderation_reason
                ELSE ''
              END;
  END IF;

  -- actor は decided_by の admin (NULL なら投稿者本人を入れる = self-skip 回避)
  v_actor_id := COALESCE(NEW.moderation_decided_by, NEW.submitted_by_user_id);

  BEGIN
    -- actor = recipient のときは create_notification 内部で self-skip されるので、
    -- decided_by が NULL or 投稿者本人 self-moderation の異常ケースでは届かない (= 設計上問題なし)
    PERFORM public.create_notification(
      NEW.submitted_by_user_id,
      v_actor_id,
      'creator_looks_moderation_result',
      'creator_looks_template',
      NEW.id,
      v_title,
      v_body,
      jsonb_build_object(
        'template_id', NEW.id,
        'action', v_action,
        'moderation_status', NEW.moderation_status
      )
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.style_template_audit_logs (template_id, actor_id, action, reason, metadata)
    VALUES (NEW.id, v_actor_id, 'submit',
            'notify_moderation_failed', jsonb_build_object('error', SQLERRM));
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_creator_looks_on_moderation_decision() IS
  'Creator Looks 投稿の moderation_status 変化時に通知 C (= 承認/却下) を投稿者に発火する trigger 関数';

DROP TRIGGER IF EXISTS trg_notify_creator_looks_on_moderation_decision
  ON public.user_style_templates;
CREATE TRIGGER trg_notify_creator_looks_on_moderation_decision
  AFTER UPDATE OF moderation_status ON public.user_style_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_creator_looks_on_moderation_decision();

REVOKE ALL ON FUNCTION public.notify_creator_looks_on_moderation_decision()
  FROM PUBLIC, anon;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_creator_looks_on_moderation_decision ON public.user_style_templates;
-- DROP FUNCTION IF EXISTS public.notify_creator_looks_on_moderation_decision();
-- COMMIT;
-- ===============================================
