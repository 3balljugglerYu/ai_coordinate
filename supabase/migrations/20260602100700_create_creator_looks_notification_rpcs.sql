-- ===============================================
-- Creator Looks: 通知 RPC 2 種を追加
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-004
--
-- (1) create_notification_bulk(...): 既存 create_notification の bulk 版。
--     通知 A (= 運営全員に同じ通知) を 1 回の RPC で発火するため。
-- (2) create_creator_looks_self_notification(...): 通知 B (= 投稿者本人への自己通知) 用。
--     既存 create_notification は recipient_id = actor_id を skip するため、
--     Creator Looks 用の self-notification 専用 RPC を追加。
--     type は 'creator_looks_submission_acknowledged' のみ許可 (= 任意 type の悪用防止)。
--
-- どちらも SECURITY DEFINER で notifications RLS (= WITH CHECK (false)) をバイパス。
-- 失敗時は RAISE WARNING で記録し、NULL を返して呼出側を中断させない (= 通知失敗で
-- ビジネス処理を ROLLBACK しない設計、既存 create_notification と同じ)。

BEGIN;

-- (1) bulk INSERT 用 RPC
CREATE OR REPLACE FUNCTION public.create_notification_bulk(
  p_recipient_ids UUID[],
  p_actor_id UUID,
  p_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
  v_inserted_count INTEGER := 0;
BEGIN
  IF p_recipient_ids IS NULL OR cardinality(p_recipient_ids) = 0 THEN
    RETURN 0;
  END IF;

  FOREACH v_recipient_id IN ARRAY p_recipient_ids
  LOOP
    -- 自己通知はスキップ (= 既存 create_notification と同じ挙動)
    IF v_recipient_id = p_actor_id THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.create_notification(
        v_recipient_id,
        p_actor_id,
        p_type,
        p_entity_type,
        p_entity_id,
        p_title,
        p_body,
        p_data
      );
      v_inserted_count := v_inserted_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_notification_bulk: failed for recipient % type %: %',
          v_recipient_id, p_type, SQLERRM;
    END;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

COMMENT ON FUNCTION public.create_notification_bulk(UUID[], UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) IS
  '複数 recipient に同じ通知を発火する bulk 版。内部で create_notification を 1 件ずつ呼び、自己通知はスキップ';

REVOKE ALL ON FUNCTION public.create_notification_bulk(UUID[], UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification_bulk(UUID[], UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB)
  TO authenticated;

-- (2) self-notification 専用 RPC
-- type は 'creator_looks_submission_acknowledged' のみ許可。
-- これにより任意 type で自己通知を作る経路を塞ぐ。
CREATE OR REPLACE FUNCTION public.create_creator_looks_self_notification(
  p_user_id UUID,
  p_template_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_template_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 通知 type を 1 種類に固定 (= 任意 type の自己通知作成を禁止)
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    title,
    body,
    data
  ) VALUES (
    p_user_id,
    p_user_id,
    'creator_looks_submission_acknowledged',
    'creator_looks_template',
    p_template_id,
    p_title,
    p_body,
    COALESCE(p_data, '{}'::JSONB)
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'create_creator_looks_self_notification: failed for user % template %: %',
      p_user_id, p_template_id, SQLERRM;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.create_creator_looks_self_notification(UUID, UUID, TEXT, TEXT, JSONB) IS
  'Creator Looks の通知 B (= 投稿者本人への受付完了通知) 専用 RPC。type は creator_looks_submission_acknowledged 固定';

REVOKE ALL ON FUNCTION public.create_creator_looks_self_notification(UUID, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_creator_looks_self_notification(UUID, UUID, TEXT, TEXT, JSONB)
  TO authenticated;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.create_creator_looks_self_notification(UUID, UUID, TEXT, TEXT, JSONB);
-- DROP FUNCTION IF EXISTS public.create_notification_bulk(UUID[], UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB);
-- COMMIT;
-- ===============================================
