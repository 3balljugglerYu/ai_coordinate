-- ===============================================
-- 派生投稿の通知: derived_post_published
-- ===============================================
-- 計画: docs/planning/derived-post-notification-implementation-plan.md
--       REQ-001〜005 / REQ-009〜011 / REQ-013、ADR-001〜007
--
-- /free の派生投稿（source_post_id を持つ投稿）が公開されたとき、
-- 原作者へ実名通知を作る。1作品 = 1通知（ADR-001）。
--
-- 発生源は generated_images の is_posted 遷移そのもの。投稿経路は
-- サーバー経由 (postImageServer) とブラウザ直 UPDATE (postImage) の
-- 2系統あるため、API フックではなく DB トリガーで拾う（ADR-002）。
-- 手本は trg_notify_creator_looks_on_publication
-- (20260603100200) の「AFTER UPDATE OF is_posted + 遷移 WHEN 句」。
--
-- entity は派生投稿自身（ADR-003）。タップ遷移とサムネイルは
-- フロントの entity_type='post' 汎用コードがそのまま使える。
--
-- 通知の作成は既存 create_notification を呼ぶだけ（ADR-004）。
-- 自己通知スキップと EXCEPTION 吸収を流用し、ブロック判定（双方向）
-- だけをトリガー関数側で行う。
--
-- あわせて create_notification の EXECUTE を封鎖する（ADR-007）。
-- 同関数は GRANT/REVOKE 未設定のまま SECURITY DEFINER で公開されており、
-- anon / authenticated が Data API (/rest/v1/rpc/create_notification) から
-- 任意の宛先・actor・文言で通知を偽造できる既存脆弱性がある
-- （後発の create_notification_bulk は 20260602100700 で REVOKE 済み）。
-- 呼び出し元13関数はすべて SECURITY DEFINER（所有者権限で実行）・
-- アプリコードからの直接 RPC 呼び出しはゼロであることを確認済みのため、
-- REVOKE しても壊れるものはない。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. notifications.type の CHECK に新値を追加
-- ===============================================
-- 既存 20260728130000 の16値 + 'derived_post_published'。
-- entity_type は既存の 'post' を再利用するため変更しない。

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
  'derived_post_published'::text
]));

-- ===============================================
-- 2. 作品ごと最大1件の部分ユニークインデックス (REQ-002)
-- ===============================================
-- notifications_unique_like_follow_idx と同形。並行 INSERT の
-- 競合バックストップ（create_notification 側の unique_violation
-- ハンドリングが先勝ちの1件を残す）。

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_derived_post_idx
ON public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
WHERE type = 'derived_post_published';

-- ===============================================
-- 3. 通知トリガー関数 (REQ-001, 003, 004, 009)
-- ===============================================

CREATE OR REPLACE FUNCTION public.notify_on_derived_post_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_nickname TEXT;
  v_origin_caption TEXT;
BEGIN
  -- WHEN 句と同条件の再チェック（二重ガードの慣例。20260603100200 と同じ）
  IF NOT (NEW.is_posted = true
          AND OLD.is_posted IS DISTINCT FROM NEW.is_posted
          AND NEW.source_post_id IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  -- 自己派生は通知しない (REQ-003)。
  -- create_notification 側でも recipient=actor はスキップされるが二重化する。
  IF NEW.source_author_id IS NULL OR NEW.source_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- 双方向いずれかのブロック関係があれば通知しない (REQ-004)。
  -- 派生生成時にも validate_derived_prompt_source が弾くが、
  -- 生成後にブロックされてから投稿する経路をここで塞ぐ。
  IF EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE (blocker_id = NEW.source_author_id AND blocked_id = NEW.user_id)
       OR (blocker_id = NEW.user_id AND blocked_id = NEW.source_author_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nickname INTO v_actor_nickname
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- 原作キャプションは見出し用のスナップショット (ADR-003)。
  -- 原作が消えていても NULL になるだけで通知は成立する（source_post_id は FK なし）。
  SELECT caption INTO v_origin_caption
  FROM public.generated_images
  WHERE id = NEW.source_post_id;

  -- title/body は DB フォールバック（未知 type の default 分岐と Realtime 直後用）。
  -- 表示本体はフロントの presentation が type から i18n で組み立て直す。
  PERFORM public.create_notification(
    NEW.source_author_id,
    NEW.user_id,
    'derived_post_published',
    'post',
    NEW.id,
    COALESCE(v_actor_nickname, 'ユーザー') || 'があなたのプロンプトで作品を投稿しました',
    '',
    jsonb_build_object(
      'origin_caption', v_origin_caption,
      'image_url', NEW.image_url
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 通知の失敗で投稿を巻き込まない (REQ-009)。notify_on_follow と同じ二重ガード。
    RAISE WARNING 'Failed to create derived post notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_derived_post_published() IS
  '派生投稿の公開時に原作者へ derived_post_published 通知を作る。自己派生・双方向ブロックはスキップ。失敗は WARNING に留める (REQ-001/003/004/009)';

-- generated_images はインプレッション集計の集合 UPDATE が走るホットテーブル。
-- UPDATE OF is_posted で発火列を限定し、WHEN 句で「公開への遷移」だけに絞る
-- （/api/posts/update が is_posted=true を再セットしても発火しない = REQ-010）。
DROP TRIGGER IF EXISTS trg_notify_derived_post_published
  ON public.generated_images;
CREATE TRIGGER trg_notify_derived_post_published
  AFTER UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW
  WHEN (OLD.is_posted IS DISTINCT FROM NEW.is_posted
        AND NEW.is_posted = true
        AND NEW.source_post_id IS NOT NULL)
  EXECUTE FUNCTION public.notify_on_derived_post_published();

-- ===============================================
-- 4. 削除トリガー関数 (REQ-005, 009)
-- ===============================================
-- 取消・モデレーション公開停止・退会一括取消はすべて is_posted true→false。
-- その作品を指す通知だけを 5列完全一致で消す
-- （delete_notification_on_like_removal と同型）。

CREATE OR REPLACE FUNCTION public.delete_notification_on_derived_post_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.source_author_id IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.notifications
  WHERE recipient_id = OLD.source_author_id
    AND actor_id = OLD.user_id
    AND type = 'derived_post_published'
    AND entity_type = 'post'
    AND entity_id = OLD.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete derived post notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.delete_notification_on_derived_post_removal() IS
  '派生投稿が非公開になったとき、その作品を指す derived_post_published 通知を消す。他の作品の通知には触れない (REQ-005)';

DROP TRIGGER IF EXISTS trg_delete_notification_on_derived_post_removal
  ON public.generated_images;
CREATE TRIGGER trg_delete_notification_on_derived_post_removal
  AFTER UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW
  WHEN (OLD.is_posted = true
        AND NEW.is_posted = false
        AND OLD.source_post_id IS NOT NULL)
  EXECUTE FUNCTION public.delete_notification_on_derived_post_removal();

-- ===============================================
-- 5. create_notification の EXECUTE 封鎖 (ADR-007 / REQ-013)
-- ===============================================
-- 関数の再定義はしない。権限だけを create_notification_bulk
-- (20260602100700) と同じ構成に揃える。
-- 呼び出し元のトリガー/RPC はすべて SECURITY DEFINER のため、
-- 所有者権限で実行され REVOKE の影響を受けない。

REVOKE ALL ON FUNCTION public.create_notification(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.create_notification(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) TO service_role;

-- ===============================================
-- 適用後の検証
-- ===============================================
-- 1段目: データを変更しないカタログ検証。
-- 2段目: 実在データでトリガー本体を最後まで通す dry-run。
--        必ずロールバックされるサブトランザクション内で行う
--        （専用 SQLSTATE 'PT999' を最後に RAISE し、外側でそれだけを捕捉）。
--        ロールバックされた変更は logical decoding の対象外のため
--        Realtime へ一切配信されず、検証データも通知も残らない。
--        assert 失敗（別 SQLSTATE）は捕捉せず伝播し、マイグレーションを
--        失敗させる。構造検証だけでは 20260731090000 の 42703
--        （CREATE 時に本体未検証の列名誤り）を検出できないため、
--        実データ実行は省略しない。

DO $$
DECLARE
  v_constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  IF v_constraint_def IS NULL OR v_constraint_def NOT LIKE '%derived_post_published%' THEN
    RAISE EXCEPTION 'CHECK に derived_post_published が入っていない: %', v_constraint_def;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'notifications_unique_derived_post_idx'
  ) THEN
    RAISE EXCEPTION 'notifications_unique_derived_post_idx が存在しない';
  END IF;

  IF (SELECT count(*)
      FROM pg_trigger
      WHERE tgrelid = 'public.generated_images'::regclass
        AND tgname IN ('trg_notify_derived_post_published',
                       'trg_delete_notification_on_derived_post_removal')) <> 2
  THEN
    RAISE EXCEPTION '派生通知トリガー2本が generated_images に付いていない';
  END IF;

  IF to_regprocedure('public.notify_on_derived_post_published()') IS NULL
     OR to_regprocedure('public.delete_notification_on_derived_post_removal()') IS NULL
  THEN
    RAISE EXCEPTION '派生通知の関数が存在しない';
  END IF;

  -- ADR-007: 偽造経路が閉じたことを機械検証する
  IF has_function_privilege('anon',
       'public.create_notification(uuid, uuid, text, text, uuid, text, text, jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'anon が create_notification を実行できてしまう';
  END IF;
  IF has_function_privilege('authenticated',
       'public.create_notification(uuid, uuid, text, text, uuid, text, text, jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'authenticated が create_notification を実行できてしまう';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.create_notification(uuid, uuid, text, text, uuid, text, text, jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'service_role が create_notification を実行できない';
  END IF;

  RAISE NOTICE 'カタログ検証 OK（CHECK / インデックス / トリガー / 関数 / 権限）';
END;
$$;

DO $$
DECLARE
  v_origin_author UUID;
  v_deriver UUID;
  v_origin UUID;
  v_d1 UUID;
  v_d2 UUID;
  v_self UUID;
  v_count INT;
  v_remaining UUID;
BEGIN
  -- ブロック関係の無い実在ユーザー2名（原作者役・派生者役）を選ぶ。
  -- ブロック済みペアを引くと環境依存で失敗するため選定段階で除外する。
  SELECT p1.user_id, p2.user_id INTO v_origin_author, v_deriver
  FROM public.profiles p1
  JOIN public.profiles p2 ON p1.user_id <> p2.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = p1.user_id AND ub.blocked_id = p2.user_id)
       OR (ub.blocker_id = p2.user_id AND ub.blocked_id = p1.user_id)
  )
  ORDER BY p1.user_id, p2.user_id
  LIMIT 1;

  IF v_deriver IS NULL THEN
    RAISE NOTICE 'ブロック関係の無いユーザーペアが無いため dry-run をスキップした';
    RETURN;
  END IF;

  BEGIN
    -- 原作（free root・投稿済）。INSERT では通知トリガーは発火しない（UPDATE 限定）。
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type)
    VALUES
      (v_origin_author, 'https://example.invalid/dpn-origin.png', 'verify/dpn-origin.png', '', true, 'free')
    RETURNING id INTO v_origin;

    -- 派生2作品（未投稿で作成）。直接続は is_trusted_lineage_writer=true のため
    -- source 列を直接指定できる。
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, source_post_id, source_author_id)
    VALUES
      (v_deriver, 'https://example.invalid/dpn-d1.png', 'verify/dpn-d1.png', '', false, 'free', v_origin, v_origin_author)
    RETURNING id INTO v_d1;

    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, source_post_id, source_author_id)
    VALUES
      (v_deriver, 'https://example.invalid/dpn-d2.png', 'verify/dpn-d2.png', '', false, 'free', v_origin, v_origin_author)
    RETURNING id INTO v_d2;

    -- 1作品目の投稿 → 通知1件 (REQ-001)
    UPDATE public.generated_images SET is_posted = true WHERE id = v_d1;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_post_published'
      AND recipient_id = v_origin_author
      AND actor_id = v_deriver;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '1作品目の投稿で通知が1件でない: %', v_count;
    END IF;

    -- 2作品目の投稿 → 通知2件（作品ごとに独立 = REQ-002）
    UPDATE public.generated_images SET is_posted = true WHERE id = v_d2;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_post_published'
      AND recipient_id = v_origin_author
      AND actor_id = v_deriver;
    IF v_count <> 2 THEN
      RAISE EXCEPTION '2作品目の投稿で通知が2件にならない: %', v_count;
    END IF;

    -- 1作品目の取消 → その通知だけ消え、2作品目の通知が残る (REQ-005)
    UPDATE public.generated_images SET is_posted = false WHERE id = v_d1;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_post_published'
      AND recipient_id = v_origin_author
      AND actor_id = v_deriver;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '取消後に通知が1件にならない: %', v_count;
    END IF;

    SELECT entity_id INTO v_remaining
    FROM public.notifications
    WHERE type = 'derived_post_published'
      AND recipient_id = v_origin_author
      AND actor_id = v_deriver;
    IF v_remaining IS DISTINCT FROM v_d2 THEN
      RAISE EXCEPTION '残った通知が2作品目を指していない: %', v_remaining;
    END IF;

    -- 自己派生 → 通知なし (REQ-003)
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, source_post_id, source_author_id)
    VALUES
      (v_origin_author, 'https://example.invalid/dpn-self.png', 'verify/dpn-self.png', '', false, 'free', v_origin, v_origin_author)
    RETURNING id INTO v_self;

    UPDATE public.generated_images SET is_posted = true WHERE id = v_self;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'derived_post_published'
      AND recipient_id = v_origin_author
      AND actor_id = v_origin_author;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '自己派生で通知が作られてしまった: %', v_count;
    END IF;

    -- 検証成功。サブトランザクションごと必ず巻き戻す（Realtime へ漏らさない）。
    RAISE EXCEPTION USING ERRCODE = 'PT999';
  EXCEPTION
    WHEN SQLSTATE 'PT999' THEN
      RAISE NOTICE '実データ dry-run OK（投稿→2件→取消→自己派生スキップ）。変更はすべてロールバックした';
    -- 他の例外は捕捉しない = assert 失敗はマイグレーションを失敗させる
  END;
END;
$$;

-- REVOKE で Data API の関数露出が変わるため schema cache を再読み込みさせる
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_derived_post_published ON public.generated_images;
-- DROP TRIGGER IF EXISTS trg_delete_notification_on_derived_post_removal ON public.generated_images;
-- DROP FUNCTION IF EXISTS public.notify_on_derived_post_published();
-- DROP FUNCTION IF EXISTS public.delete_notification_on_derived_post_removal();
-- DROP INDEX IF EXISTS public.notifications_unique_derived_post_idx;
-- -- 既存通知の全消去（必要な場合のみ）:
-- -- DELETE FROM public.notifications WHERE type = 'derived_post_published';
-- -- CHECK 制約は derived_post_published の行を消した後でないと
-- -- 旧16値へ戻せない（行が残っていると ALTER 自体が失敗する）。
-- -- create_notification の GRANT 復元は通知偽造経路の再開通を意味するため
-- -- 非推奨（戻す場合: GRANT EXECUTE ... TO PUBLIC ではなく、必要な role へ個別に）。
-- COMMIT;
-- ===============================================
