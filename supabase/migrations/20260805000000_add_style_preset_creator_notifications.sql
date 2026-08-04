-- ===============================================
-- One-Tap Style クリエイター通知:
--   style_preset_post_published / style_preset_usage_milestone
-- ===============================================
-- 計画: docs/planning/style-preset-creator-notification-implementation-plan.md
--       REQ-001〜008、ADR-001〜006
--
-- One-Tap Style プリセットのクリエイター（provider）へ、
--   (1) 実名通知: プリセット利用画像が投稿されたとき（A案 #476 のミラー）
--   (2) 匿名通知: 生成の累計がちょうど節目に達したとき（B案 #477 のミラー）
-- を届ける。
--
-- 眠っている creator_looks 通知（trg_notify_creator_looks_on_publication）は
-- inspire 専用（generated_images.style_template_id = user_style_templates への
-- FK）で、One-Tap Style のプリセット ID は
-- generation_metadata->'oneTapStyle'->>'id' (JSONB) にのみ入るため流用不可。
-- 新 FK 列は足さず、式インデックス + JSONB 抽出で読む (ADR-001)。
--
-- provider の解決はクレジット表示 (resolveStylePresetProvider) と同一:
-- COALESCE(style_presets.provider_user_id, preset_categories.provider_user_id)。
-- profiles.id = user_id（全件一致を実測済み）のため、そのまま通知宛先になる。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. notifications.type の CHECK に2値を追加（20値）
-- ===============================================
-- 適用判断: notifications は約3,500行で全件検証はミリ秒オーダー
-- （20260804200000 と同じ判断。大規模化したら NOT VALID → VALIDATE へ）。

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
  'derived_usage_milestone'::text,
  'style_preset_post_published'::text,
  'style_preset_usage_milestone'::text
]));

-- ===============================================
-- 2. generated_images のプリセット式インデックス (ADR-001)
-- ===============================================
-- 節目カウントと投稿時の逆引きを支える。現行約2,200行・作成はミリ秒オーダー。

CREATE INDEX IF NOT EXISTS idx_generated_images_one_tap_preset
ON public.generated_images ((generation_metadata->'oneTapStyle'->>'id'))
WHERE (generation_metadata->'oneTapStyle'->>'id') IS NOT NULL;

-- ===============================================
-- 3. 冪等化のユニークインデックス2本 (ADR-006)
-- ===============================================

-- 実名側: 1投稿=1通知（A案の notifications_unique_derived_post_idx と同形）
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_style_preset_post_idx
ON public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
WHERE type = 'style_preset_post_published';

-- 匿名側: プリセット×節目ごと最大1件（B案の式インデックスと同形）
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_style_preset_milestone_idx
ON public.notifications (((data->>'preset_id')), ((data->>'milestone')))
WHERE type = 'style_preset_usage_milestone';

-- ===============================================
-- 4. 実名通知トリガー（投稿時。REQ-001, 004, 007）
-- ===============================================

CREATE OR REPLACE FUNCTION public.notify_on_style_preset_post_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preset_id UUID;
  v_provider UUID;
  v_preset_title TEXT;
  v_preset_slug TEXT;
  v_actor_nickname TEXT;
BEGIN
  -- WHEN 句と同条件の再チェック（二重ガードの慣例）
  IF NOT (NEW.is_posted = true
          AND OLD.is_posted IS DISTINCT FROM NEW.is_posted
          AND NEW.generation_metadata->'oneTapStyle'->>'id' IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  v_preset_id := (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid;

  -- provider 解決はクレジット表示と同一規則 (ADR-002)
  SELECT COALESCE(sp.provider_user_id, pc.provider_user_id), sp.title, sp.slug
  INTO v_provider, v_preset_title, v_preset_slug
  FROM public.style_presets sp
  LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
  WHERE sp.id = v_preset_id;

  IF v_provider IS NULL THEN
    RETURN NEW;
  END IF;

  -- 自己利用は通知しない (REQ-004)
  IF v_provider = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- 双方向いずれかのブロック関係があれば通知しない (REQ-004)
  IF EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE (blocker_id = v_provider AND blocked_id = NEW.user_id)
       OR (blocker_id = NEW.user_id AND blocked_id = v_provider)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nickname INTO v_actor_nickname
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- 実名通知は create_notification 経由（A案と同じ。自己スキップも流用）
  PERFORM public.create_notification(
    v_provider,
    NEW.user_id,
    'style_preset_post_published',
    'post',
    NEW.id,
    COALESCE(v_actor_nickname, 'ユーザー') || 'があなたのスタイルで作品を投稿しました',
    '',
    jsonb_build_object(
      'preset_id', v_preset_id,
      'preset_title', v_preset_title,
      'preset_slug', v_preset_slug
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 通知の失敗で投稿を巻き込まない (REQ-007)
    RAISE WARNING 'Failed to create style preset post notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_style_preset_post_published() IS
  'One-Tap Style プリセット利用画像の投稿時、provider へ実名の style_preset_post_published 通知を作る。自己利用・双方向ブロックはスキップ (REQ-001/004/007)';

DROP TRIGGER IF EXISTS trg_notify_style_preset_post_published
  ON public.generated_images;
CREATE TRIGGER trg_notify_style_preset_post_published
  AFTER UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW
  WHEN (OLD.is_posted IS DISTINCT FROM NEW.is_posted
        AND NEW.is_posted = true
        AND (NEW.generation_metadata->'oneTapStyle'->>'id') IS NOT NULL)
  EXECUTE FUNCTION public.notify_on_style_preset_post_published();

-- ===============================================
-- 5. 実名通知の削除トリガー（非公開化時。REQ-002, ADR-005）
-- ===============================================
-- 取消・モデレーション公開停止・退会一括取消はすべて is_posted true→false。
-- entity_id=画像ID の一致で消す（1投稿=1通知のため十分）。

CREATE OR REPLACE FUNCTION public.delete_style_preset_post_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE type = 'style_preset_post_published'
    AND entity_type = 'post'
    AND entity_id = OLD.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to delete style preset post notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.delete_style_preset_post_notification() IS
  'プリセット利用画像が非公開になったとき、その投稿の style_preset_post_published 通知を消す（リンク切れ回避。REQ-002）';

DROP TRIGGER IF EXISTS trg_delete_style_preset_post_notification
  ON public.generated_images;
CREATE TRIGGER trg_delete_style_preset_post_notification
  AFTER UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW
  WHEN (OLD.is_posted = true
        AND NEW.is_posted = false
        AND (OLD.generation_metadata->'oneTapStyle'->>'id') IS NOT NULL)
  EXECUTE FUNCTION public.delete_style_preset_post_notification();

-- ===============================================
-- 6. 匿名の節目通知トリガー（生成時。REQ-003, 004, 007）
-- ===============================================

CREATE OR REPLACE FUNCTION public.notify_on_style_preset_usage_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preset_id UUID;
  v_provider UUID;
  v_preset_title TEXT;
  v_preset_slug TEXT;
  v_preset_thumbnail TEXT;
  v_count BIGINT;
BEGIN
  IF NEW.generation_metadata->'oneTapStyle'->>'id' IS NULL THEN
    RETURN NEW;
  END IF;

  v_preset_id := (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid;

  SELECT COALESCE(sp.provider_user_id, pc.provider_user_id),
         sp.title, sp.slug, sp.thumbnail_image_url
  INTO v_provider, v_preset_title, v_preset_slug, v_preset_thumbnail
  FROM public.style_presets sp
  LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
  WHERE sp.id = v_preset_id;

  IF v_provider IS NULL THEN
    RETURN NEW;
  END IF;

  -- provider 自身の生成は数えず、通知もしない (REQ-004)
  IF NEW.user_id = v_provider THEN
    RETURN NEW;
  END IF;

  -- 通算（provider 除外）×「ちょうど節目」のみ発火 (ADR-003 = B案 ADR-002)。
  -- 式インデックス idx_generated_images_one_tap_preset で引き、
  -- 最大節目 1000 超過後は LIMIT 1001 で走査を打ち切る。
  SELECT count(*) INTO v_count
  FROM (
    SELECT 1
    FROM public.generated_images
    WHERE (generation_metadata->'oneTapStyle'->>'id') = v_preset_id::text
      AND user_id <> v_provider
    LIMIT 1001
  ) AS bounded_usage;

  IF v_count NOT IN (1, 5, 10, 25, 50, 100, 250, 500, 1000) THEN
    RETURN NEW;
  END IF;

  -- 匿名通知: actor は recipient 本人（B案と同じ。create_notification の
  -- self-skip を回避するため直接 INSERT）。
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
    v_provider,
    v_provider,
    'style_preset_usage_milestone',
    'user',
    v_provider,
    CASE WHEN v_count = 1
      THEN 'あなたのスタイルが初めて利用されました'
      ELSE 'あなたのスタイルが' || v_count || '回利用されました'
    END,
    '',
    jsonb_build_object(
      'preset_id', v_preset_id,
      'preset_title', v_preset_title,
      'preset_slug', v_preset_slug,
      'milestone', v_count,
      'image_url', v_preset_thumbnail,
      'system_generated', true
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- 並行 INSERT の先勝ち（正常系）
    RETURN NEW;
  WHEN OTHERS THEN
    -- 生成完了 RPC を巻き込まない (REQ-007)
    RAISE WARNING 'Failed to create style preset milestone notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_style_preset_usage_milestone() IS
  'One-Tap Style 生成の累計（provider 除外）が節目にちょうど達したとき、provider へ匿名の style_preset_usage_milestone 通知を作る (REQ-003/004/007)';

DROP TRIGGER IF EXISTS trg_notify_style_preset_usage_milestone
  ON public.generated_images;
CREATE TRIGGER trg_notify_style_preset_usage_milestone
  AFTER INSERT ON public.generated_images
  FOR EACH ROW
  WHEN ((NEW.generation_metadata->'oneTapStyle'->>'id') IS NOT NULL)
  EXECUTE FUNCTION public.notify_on_style_preset_usage_milestone();

-- ===============================================
-- 適用後の検証
-- ===============================================

DO $$
DECLARE
  v_constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint_def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  IF v_constraint_def IS NULL
     OR v_constraint_def NOT LIKE '%style_preset_post_published%'
     OR v_constraint_def NOT LIKE '%style_preset_usage_milestone%'
  THEN
    RAISE EXCEPTION 'CHECK に新 type が入っていない: %', v_constraint_def;
  END IF;

  IF (SELECT count(*) FROM pg_indexes
      WHERE indexname IN ('idx_generated_images_one_tap_preset',
                          'notifications_unique_style_preset_post_idx',
                          'notifications_unique_style_preset_milestone_idx')) <> 3
  THEN
    RAISE EXCEPTION '新設インデックス3本が揃っていない';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.generated_images'::regclass
        AND tgname IN ('trg_notify_style_preset_post_published',
                       'trg_delete_style_preset_post_notification',
                       'trg_notify_style_preset_usage_milestone')) <> 3
  THEN
    RAISE EXCEPTION 'トリガー3本が generated_images に付いていない';
  END IF;

  IF to_regprocedure('public.notify_on_style_preset_post_published()') IS NULL
     OR to_regprocedure('public.delete_style_preset_post_notification()') IS NULL
     OR to_regprocedure('public.notify_on_style_preset_usage_milestone()') IS NULL
  THEN
    RAISE EXCEPTION '関数3本が存在しない';
  END IF;

  RAISE NOTICE 'カタログ検証 OK（CHECK / インデックス3本 / トリガー3本 / 関数3本）';
END;
$$;

-- 実データ dry-run（必ずロールバックされるサブトランザクション。
-- aborted subtransaction は logical decoding 対象外のため Realtime へ漏れない）。
-- 一時カテゴリ＋一時プリセット（provider=実在ユーザー）を作り、
-- 実名・匿名の両経路をトリガー本体まで通す。

DO $$
DECLARE
  v_provider UUID;
  v_consumer UUID;
  v_category UUID;
  v_preset UUID;
  v_img1 UUID;
  v_count INT;
  i INT;
BEGIN
  SELECT p1.user_id, p2.user_id INTO v_provider, v_consumer
  FROM public.profiles p1
  JOIN public.profiles p2 ON p1.user_id < p2.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = p1.user_id AND ub.blocked_id = p2.user_id)
       OR (ub.blocker_id = p2.user_id AND ub.blocked_id = p1.user_id)
  )
  LIMIT 1;

  IF v_consumer IS NULL THEN
    RAISE NOTICE 'ブロック関係の無いユーザーペアが無いため dry-run をスキップした';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.preset_categories (key, display_name_ja, display_name_en, is_active)
    VALUES ('verify-spn-cat', '検証用', 'verify', false)
    RETURNING id INTO v_category;

    INSERT INTO public.style_presets
      (slug, title, thumbnail_image_url, thumbnail_width, thumbnail_height,
       styling_prompt, category_id, image_input_mode, status, provider_user_id)
    VALUES
      ('verify-spn-preset', '検証用スタイル', 'https://example.invalid/spn-thumb.png', 100, 100,
       'verify', v_category, 'single', 'published', v_provider)
    RETURNING id INTO v_preset;

    -- 1回目の生成 → 「初めて」通知 (REQ-003, milestone=1)
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/spn-1.png', 'verify/spn-1.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)))
    RETURNING id INTO v_img1;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '1回目の生成で節目通知が1件でない: %', v_count;
    END IF;

    -- 2〜4回目 → 増えない
    FOR i IN 2..4 LOOP
      INSERT INTO public.generated_images
        (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
      VALUES
        (v_consumer, 'https://example.invalid/spn-' || i || '.png', 'verify/spn-' || i || '.png', '', false, 'one_tap_style',
         jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));
    END LOOP;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '2〜4回目で節目通知が増えてしまった: %', v_count;
    END IF;

    -- 5回目 → 2件目（milestone=5）
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/spn-5.png', 'verify/spn-5.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 2 THEN
      RAISE EXCEPTION '5回目の生成で節目通知が2件にならない: %', v_count;
    END IF;

    -- provider 自身の生成 → 不変 (REQ-004)
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_provider, 'https://example.invalid/spn-self.png', 'verify/spn-self.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 2 THEN
      RAISE EXCEPTION 'provider 自身の生成で節目通知が変化した: %', v_count;
    END IF;

    -- 投稿 → 実名通知 (REQ-001)
    UPDATE public.generated_images SET is_posted = true WHERE id = v_img1;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_post_published'
      AND entity_id = v_img1
      AND recipient_id = v_provider
      AND actor_id = v_consumer;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '投稿で実名通知が1件でない: %', v_count;
    END IF;

    -- 取消 → 実名通知だけ消え、節目通知は残る (REQ-002 / ADR-005)
    UPDATE public.generated_images SET is_posted = false WHERE id = v_img1;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_post_published' AND entity_id = v_img1;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '取消で実名通知が消えていない: %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 2 THEN
      RAISE EXCEPTION '取消で節目通知まで消えてしまった: %', v_count;
    END IF;

    -- 検証成功。サブトランザクションごと必ず巻き戻す
    RAISE EXCEPTION USING ERRCODE = 'PT999';
  EXCEPTION
    WHEN SQLSTATE 'PT999' THEN
      RAISE NOTICE '実データ dry-run OK（初回→非節目→5回→自己除外→投稿の実名通知→取消で実名のみ削除）。変更はすべてロールバックした';
    -- 他の例外は捕捉しない = assert 失敗はマイグレーションを失敗させる
  END;
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_style_preset_post_published ON public.generated_images;
-- DROP TRIGGER IF EXISTS trg_delete_style_preset_post_notification ON public.generated_images;
-- DROP TRIGGER IF EXISTS trg_notify_style_preset_usage_milestone ON public.generated_images;
-- DROP FUNCTION IF EXISTS public.notify_on_style_preset_post_published();
-- DROP FUNCTION IF EXISTS public.delete_style_preset_post_notification();
-- DROP FUNCTION IF EXISTS public.notify_on_style_preset_usage_milestone();
-- DROP INDEX IF EXISTS public.idx_generated_images_one_tap_preset;
-- DROP INDEX IF EXISTS public.notifications_unique_style_preset_post_idx;
-- DROP INDEX IF EXISTS public.notifications_unique_style_preset_milestone_idx;
-- -- 既存通知の全消去（必要な場合のみ）:
-- -- DELETE FROM public.notifications WHERE type IN ('style_preset_post_published','style_preset_usage_milestone');
-- -- CHECK 制約は該当行を消した後でないと旧18値へ戻せない。
-- COMMIT;
-- ===============================================
