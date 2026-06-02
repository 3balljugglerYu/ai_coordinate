-- ===============================================
-- 既存 Inspire 投稿数 cap (5 件) から Creator Looks 投稿を除外
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-007
--
-- 既存 enforce_user_style_template_submission_cap は「pending または visible 件数が 5 件超」を拒否するが、
-- Creator Looks 投稿はこのカウントに含めない (= Inspire と Creator Looks は別系統で管理)。
-- Creator Looks は別途 1 日 2 件の cap (= trg_enforce_creator_looks_daily_cap) で制御する。
--
-- 変更点:
--   - 関数本体に WHERE 句追加: NEW.is_creator_looks = false のときのみカウント (= Creator Looks は素通し)
--   - カウント対象も既存 pending/visible 行のうち is_creator_looks = false に限定

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

  -- Creator Looks 投稿は別 cap (= trg_enforce_creator_looks_daily_cap) で管理するため、ここでは素通し
  IF NEW.is_creator_looks = true THEN
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
  'Inspire 投稿の cap (5 件) を強制する trigger 関数。Creator Looks 投稿 (is_creator_looks=true) は除外し、別 trigger で管理する';

-- ===============================================
-- DOWN: 元の関数定義 (Creator Looks 除外なし) を復元
-- ===============================================
