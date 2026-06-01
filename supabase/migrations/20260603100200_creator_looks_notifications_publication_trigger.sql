-- ===============================================
-- Creator Looks 通知 Trigger 3: ホーム投稿公開 (通知 D, one-shot)
-- ===============================================
-- 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-006, HI-007 (Security)
--
-- 発火条件:
--   generated_images AFTER UPDATE OF is_posted
--   かつ OLD.is_posted IS DISTINCT FROM NEW.is_posted AND NEW.is_posted = true
--   かつ NEW.creator_notified_at IS NULL (= 既に通知済なら再発火しない、one-shot)
--   かつ NEW.style_template_id IS NOT NULL
--   かつ 紐づく user_style_templates.is_creator_looks = true
--
-- 通知:
--   投稿者 (= テンプレ作者) に 'creator_looks_post_published'
--   actor = 消費者 (= generated_images.user_id)
--   作成成功後、creator_notified_at = now() を立てて one-shot 化
--
-- HI-007 対策:
--   is_posted を false→true→false→true と繰り返すケースでも、
--   creator_notified_at IS NOT NULL になると以降は no-op になり、スパムを防ぐ。

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_creator_looks_on_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_record RECORD;
  v_consumer_nickname TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- 冪等性 + one-shot ガード
  IF OLD.is_posted IS NOT DISTINCT FROM NEW.is_posted THEN
    RETURN NEW;
  END IF;
  IF NEW.is_posted IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.creator_notified_at IS NOT NULL THEN
    -- 既に通知済 (= 何らかの理由で is_posted が false→true→false→true と循環した場合)
    RETURN NEW;
  END IF;
  IF NEW.style_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 紐づくテンプレが Creator Looks か判定
  SELECT id, submitted_by_user_id, is_creator_looks, alt
  INTO v_template_record
  FROM public.user_style_templates
  WHERE id = NEW.style_template_id;

  IF v_template_record.id IS NULL OR v_template_record.is_creator_looks IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- 消費者ニックネーム取得
  SELECT nickname INTO v_consumer_nickname
  FROM public.profiles
  WHERE user_id = NEW.user_id;
  v_consumer_nickname := COALESCE(NULLIF(v_consumer_nickname, ''), 'ユーザー');

  v_title := 'あなたの衣装で投稿が公開されました';
  v_body := v_consumer_nickname || ' さんが「' ||
            COALESCE(NULLIF(v_template_record.alt, ''), '無題') ||
            '」の衣装で生成した画像をホームに投稿しました。';

  BEGIN
    PERFORM public.create_notification(
      v_template_record.submitted_by_user_id,
      NEW.user_id,
      'creator_looks_post_published',
      'creator_looks_template',
      v_template_record.id,
      v_title,
      v_body,
      jsonb_build_object(
        'template_id', v_template_record.id,
        'generated_image_id', NEW.id,
        'consumer_user_id', NEW.user_id
      )
    );

    -- one-shot 化: creator_notified_at を立てる
    -- 注: 同じトリガ内で同じ行を UPDATE すると再帰しないよう
    -- WHEN 条件で creator_notified_at IS NULL のときだけ発火するように Trigger 側に組み込み済み
    -- とは言えダブルブッキングを避けるため WHEN 句で明示する
    UPDATE public.generated_images
    SET creator_notified_at = now()
    WHERE id = NEW.id
      AND creator_notified_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.style_template_audit_logs (template_id, actor_id, action, reason, metadata)
    VALUES (v_template_record.id, NEW.user_id, 'submit',
            'notify_publication_failed',
            jsonb_build_object(
              'error', SQLERRM,
              'generated_image_id', NEW.id
            ));
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_creator_looks_on_publication() IS
  'generated_images.is_posted false→true 遷移時に Creator Looks 由来なら投稿者に通知 D を発火する trigger 関数 (one-shot)';

DROP TRIGGER IF EXISTS trg_notify_creator_looks_on_publication
  ON public.generated_images;
CREATE TRIGGER trg_notify_creator_looks_on_publication
  AFTER UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW
  -- WHEN 句で「is_posted=true への遷移かつ未通知」のときだけ関数を呼ぶ (= 通常の UPDATE で空振りしない)
  WHEN (OLD.is_posted IS DISTINCT FROM NEW.is_posted
        AND NEW.is_posted = true
        AND NEW.creator_notified_at IS NULL
        AND NEW.style_template_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_creator_looks_on_publication();

REVOKE ALL ON FUNCTION public.notify_creator_looks_on_publication()
  FROM PUBLIC, anon;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_creator_looks_on_publication ON public.generated_images;
-- DROP FUNCTION IF EXISTS public.notify_creator_looks_on_publication();
-- COMMIT;
-- ===============================================
