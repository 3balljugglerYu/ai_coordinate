-- ===============================================
-- プロンプト利用数マイルストーン通知: derived_usage_milestone
-- ===============================================
-- 計画: docs/planning/derived-usage-milestone-notification-implementation-plan.md
--       REQ-001〜010、ADR-001〜005
--
-- /free の派生生成（投稿されない静かな利用）の累計回数が節目
-- (1, 5, 10, 25, 50, 100, 250, 500, 1000) にちょうど達した瞬間、
-- 原作者へ匿名の集約通知を作る（A案=派生投稿の実名通知 #476 の対）。
--
-- マイルストーン型のため cron 不要。発生源は prompt_usage_events の
-- INSERT そのもの（書き込みは Worker 完了 RPC の1経路のみ・
-- ON CONFLICT DO NOTHING のため再試行では発火しない）。
--
-- 「通算を数え、ちょうど節目のときだけ発火」により、稼働時点で既に
-- カウントがある投稿へ遡って通知しない（ゼロベースライン。ADR-002）。
-- ベースラインの保存も稼働日時のハードコードも不要で、通知に載る数字は
-- 通算の実数になる。
--
-- 匿名通知のため actor_id には recipient 本人を入れる（moderation 通知の
-- ADR-011 と同じパターン）。create_notification は recipient=actor を
-- 自己通知としてスキップするため使わず、直接 INSERT する
-- （moderation outbox dispatcher と同じ理由。ADR-003）。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. notifications.type の CHECK に新値を追加
-- ===============================================
-- 20260804200000 の17値 + 'derived_usage_milestone'。
-- entity_type は既存の 'post' を再利用するため変更しない。
--
-- ADD CONSTRAINT は ACCESS EXCLUSIVE を取り既存行を全件検証する。
-- 適用判断: 2026-08-04 時点の本番 notifications は約 3,500 行で検証は
-- ミリ秒オーダー（20260804200000 と同じ判断）。数百万行に育ったら
-- NOT VALID → VALIDATE の2段適用へ切り替えること。

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'like'::text,
  'comment'::text,
  'follow'::text,
  'bonus'::text,
  'style_template_approved'::text,
  'style_template_rejected'::text,
  'style_template_unpublished'::text,
  'catalog_entry_approved'::text,
  'catalog_entry_rejected'::text,
  'catalog_entry_unpublished'::text,
  'creator_looks_submission_received'::text,
  'creator_looks_submission_acknowledged'::text,
  'creator_looks_moderation_result'::text,
  'creator_looks_post_published'::text,
  'post_moderation_removed'::text,
  'post_moderation_appeal_result'::text,
  'derived_post_published'::text,
  'derived_usage_milestone'::text
]));

-- ===============================================
-- 2. 原作×節目ごと最大1件の部分ユニークインデックス (REQ-004)
-- ===============================================
-- moderation の式インデックス (uq_notifications_moderation_event_key) と
-- 同じ手法。並行 INSERT の競合バックストップ（先勝ちの1件が残る）。

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_usage_milestone_idx
ON public.notifications (entity_id, ((data->>'milestone')))
WHERE type = 'derived_usage_milestone';

-- ===============================================
-- 3. 節目通知トリガー関数 (REQ-001, 002, 003, 009)
-- ===============================================

CREATE OR REPLACE FUNCTION public.notify_on_prompt_usage_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count BIGINT;
  v_origin_is_posted BOOLEAN;
BEGIN
  -- 原作者自身の生成は数えない (REQ-002)。
  -- 公開カウント get_prompt_usage_count と同じ除外規則。
  IF NEW.user_id = NEW.origin_author_id THEN
    RETURN NEW;
  END IF;

  -- 通算回数（原作者除外）。「ちょうど節目」のときだけ発火する (ADR-002)。
  -- idx_prompt_usage_events_origin があるため安価。最大節目 1000 を超えたら
  -- 正確な件数は不要なので 1001 件で走査を打ち切り、人気投稿でも
  -- Worker 完了 RPC の待ち時間を一定に保つ。
  SELECT count(*) INTO v_count
  FROM (
    SELECT 1
    FROM public.prompt_usage_events
    WHERE origin_post_id = NEW.origin_post_id
      AND user_id <> origin_author_id
    LIMIT 1001
  ) AS bounded_usage;

  IF v_count NOT IN (1, 5, 10, 25, 50, 100, 250, 500, 1000) THEN
    RETURN NEW;
  END IF;

  -- 原作が現在も投稿中のときだけ通知する (REQ-003)。
  -- 取消直後に生成完了が滑り込む競合と、原作消滅（FK なし）の防御。
  -- FOR SHARE で原作行を共有ロックし、非公開化 (UPDATE is_posted=false) と
  -- 直列化する。これが無いと「ここで true を読む → 別トランザクションが
  -- 非公開化して削除トリガーまで完了 → その後に通知 INSERT」の順序で
  -- リンク切れ通知が残り得る (REQ-008 の不変条件が崩れる)。
  SELECT is_posted INTO v_origin_is_posted
  FROM public.generated_images
  WHERE id = NEW.origin_post_id
  FOR SHARE;

  IF NOT FOUND OR v_origin_is_posted IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- 匿名通知: actor は recipient 本人 (moderation ADR-011 と同じ)。
  -- title/body は DB フォールバック。表示本体はフロントの presentation が
  -- type と data.milestone から i18n で組み立て直す。
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
    NEW.origin_author_id,
    NEW.origin_author_id,
    'derived_usage_milestone',
    'post',
    NEW.origin_post_id,
    CASE WHEN v_count = 1
      THEN 'あなたのプロンプトが初めて利用されました'
      ELSE 'あなたのプロンプトが' || v_count || '回利用されました'
    END,
    '',
    jsonb_build_object('milestone', v_count, 'system_generated', true)
  );

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- 並行 INSERT の先勝ち (REQ-004)。正常系なので WARNING も出さない。
    RETURN NEW;
  WHEN OTHERS THEN
    -- 通知の失敗で生成完了 RPC を巻き込まない (REQ-009)。
    RAISE WARNING 'Failed to create usage milestone notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_prompt_usage_milestone() IS
  '派生生成の累計回数（原作者除外）が節目にちょうど達したとき、原作者へ derived_usage_milestone 通知を匿名で作る。失敗は WARNING に留める (REQ-001/002/003/009)';

DROP TRIGGER IF EXISTS trg_notify_prompt_usage_milestone
  ON public.prompt_usage_events;
CREATE TRIGGER trg_notify_prompt_usage_milestone
  AFTER INSERT ON public.prompt_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_prompt_usage_milestone();

-- ===============================================
-- 4. 原作の非公開化でマイルストーン通知を削除 (REQ-008, ADR-005)
-- ===============================================
-- A案の削除トリガーは「派生投稿側の非公開化」（source_post_id 非NULL）が
-- 条件のため流用できない。原作＝free root の非公開化を別トリガーで拾う。

CREATE OR REPLACE FUNCTION public.delete_usage_milestone_on_origin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE type = 'derived_usage_milestone'
    AND entity_type = 'post'
    AND entity_id = OLD.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete usage milestone notifications: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.delete_usage_milestone_on_origin_removal() IS
  '原作（free root）が非公開になったとき、その投稿の derived_usage_milestone 通知を消す（リンク切れ回避。REQ-008）';

DROP TRIGGER IF EXISTS trg_delete_usage_milestone_on_origin_removal
  ON public.generated_images;
CREATE TRIGGER trg_delete_usage_milestone_on_origin_removal
  AFTER UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW
  WHEN (OLD.is_posted = true
        AND NEW.is_posted = false
        AND OLD.source_post_id IS NULL
        AND OLD.generation_type = 'free')
  EXECUTE FUNCTION public.delete_usage_milestone_on_origin_removal();

-- ===============================================
-- 適用後の検証
-- ===============================================
-- 20260804200000 と同じ2段構成。
-- 実データ dry-run は必ずロールバックされるサブトランザクション内で行い、
-- Realtime へ配信されず（aborted subtransaction は logical decoding 対象外）、
-- データも残らない。assert 失敗は伝播しマイグレーションを失敗させる。

DO $$
DECLARE
  v_constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  IF v_constraint_def IS NULL OR v_constraint_def NOT LIKE '%derived_usage_milestone%' THEN
    RAISE EXCEPTION 'CHECK に derived_usage_milestone が入っていない: %', v_constraint_def;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_unique_usage_milestone_idx'
  ) THEN
    RAISE EXCEPTION 'notifications_unique_usage_milestone_idx が存在しない';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.prompt_usage_events'::regclass
      AND tgname = 'trg_notify_prompt_usage_milestone'
  ) THEN
    RAISE EXCEPTION 'trg_notify_prompt_usage_milestone が prompt_usage_events に付いていない';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.generated_images'::regclass
      AND tgname = 'trg_delete_usage_milestone_on_origin_removal'
  ) THEN
    RAISE EXCEPTION 'trg_delete_usage_milestone_on_origin_removal が generated_images に付いていない';
  END IF;

  IF to_regprocedure('public.notify_on_prompt_usage_milestone()') IS NULL
     OR to_regprocedure('public.delete_usage_milestone_on_origin_removal()') IS NULL
  THEN
    RAISE EXCEPTION 'マイルストーン通知の関数が存在しない';
  END IF;

  RAISE NOTICE 'カタログ検証 OK（CHECK / インデックス / トリガー / 関数）';
END;
$$;

DO $$
DECLARE
  v_origin_author UUID;
  v_deriver UUID;
  v_origin UUID;
  v_count INT;
  i INT;
BEGIN
  -- 実在ユーザー2名（原作者役・利用者役）。ブロック関係は本機能に無関係。
  SELECT p1.user_id, p2.user_id INTO v_origin_author, v_deriver
  FROM public.profiles p1
  JOIN public.profiles p2 ON p1.user_id < p2.user_id
  LIMIT 1;

  IF v_deriver IS NULL THEN
    RAISE NOTICE 'ユーザーが2名未満のため dry-run をスキップした';
    RETURN;
  END IF;

  BEGIN
    -- 原作（free root・投稿済）
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type)
    VALUES
      (v_origin_author, 'https://example.invalid/dum-origin.png', 'verify/dum-origin.png', '', true, 'free')
    RETURNING id INTO v_origin;

    -- 1回目の利用 → 「初めて」通知1件 (REQ-001, milestone=1)
    INSERT INTO public.prompt_usage_events (image_job_id, origin_post_id, origin_author_id, user_id)
    VALUES (gen_random_uuid(), v_origin, v_origin_author, v_deriver);

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_usage_milestone' AND entity_id = v_origin;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '1回目の利用で通知が1件でない: %', v_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'derived_usage_milestone'
        AND entity_id = v_origin
        AND data->>'milestone' = '1'
        AND recipient_id = v_origin_author
        AND actor_id = v_origin_author
    ) THEN
      RAISE EXCEPTION 'milestone=1 の匿名通知（recipient=actor=原作者）が無い';
    END IF;

    -- 2〜4回目 → 節目ではないので通知は増えない
    FOR i IN 2..4 LOOP
      INSERT INTO public.prompt_usage_events (image_job_id, origin_post_id, origin_author_id, user_id)
      VALUES (gen_random_uuid(), v_origin, v_origin_author, v_deriver);
    END LOOP;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_usage_milestone' AND entity_id = v_origin;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '2〜4回目で通知が増えてしまった: %', v_count;
    END IF;

    -- 5回目 → 「5回」通知が2件目として追加される
    INSERT INTO public.prompt_usage_events (image_job_id, origin_post_id, origin_author_id, user_id)
    VALUES (gen_random_uuid(), v_origin, v_origin_author, v_deriver);

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_usage_milestone' AND entity_id = v_origin;
    IF v_count <> 2 THEN
      RAISE EXCEPTION '5回目の利用で通知が2件にならない: %', v_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'derived_usage_milestone'
        AND entity_id = v_origin
        AND data->>'milestone' = '5'
    ) THEN
      RAISE EXCEPTION 'milestone=5 の通知が無い';
    END IF;

    -- 原作者自身の利用 → 数えず、通知も増えない (REQ-002)
    INSERT INTO public.prompt_usage_events (image_job_id, origin_post_id, origin_author_id, user_id)
    VALUES (gen_random_uuid(), v_origin, v_origin_author, v_origin_author);

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_usage_milestone' AND entity_id = v_origin;
    IF v_count <> 2 THEN
      RAISE EXCEPTION '原作者自身の利用で通知が変化した: %', v_count;
    END IF;

    -- 原作の取消 → マイルストーン通知が全て消える (REQ-008)
    UPDATE public.generated_images SET is_posted = false WHERE id = v_origin;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_usage_milestone' AND entity_id = v_origin;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '原作の取消でマイルストーン通知が消えていない: %', v_count;
    END IF;

    -- 検証成功。サブトランザクションごと必ず巻き戻す（Realtime へ漏らさない）。
    RAISE EXCEPTION USING ERRCODE = 'PT999';
  EXCEPTION
    WHEN SQLSTATE 'PT999' THEN
      RAISE NOTICE '実データ dry-run OK（初回→非節目→5回→自己利用除外→原作取消で削除）。変更はすべてロールバックした';
    -- 他の例外は捕捉しない = assert 失敗はマイグレーションを失敗させる
  END;
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_prompt_usage_milestone ON public.prompt_usage_events;
-- DROP TRIGGER IF EXISTS trg_delete_usage_milestone_on_origin_removal ON public.generated_images;
-- DROP FUNCTION IF EXISTS public.notify_on_prompt_usage_milestone();
-- DROP FUNCTION IF EXISTS public.delete_usage_milestone_on_origin_removal();
-- DROP INDEX IF EXISTS public.notifications_unique_usage_milestone_idx;
-- -- 既存通知の全消去（必要な場合のみ）:
-- -- DELETE FROM public.notifications WHERE type = 'derived_usage_milestone';
-- -- CHECK 制約は derived_usage_milestone の行を消した後でないと
-- -- 旧17値へ戻せない（行が残っていると ALTER 自体が失敗する）。
-- COMMIT;
-- ===============================================
