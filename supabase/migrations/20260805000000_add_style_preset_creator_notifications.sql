-- ===============================================
-- One-Tap Style クリエイター通知:
--   style_preset_post_published / style_preset_usage_milestone
-- ===============================================
-- 計画: docs/planning/style-preset-creator-notification-implementation-plan.md
--       REQ-001〜008、ADR-001〜008
--
-- /free の派生生成（投稿されない静かな利用）に対する A案(#476)/B案(#477) の
-- One-Tap Style 版ミラー。プリセットの provider へ、
--   (1) 実名通知: プリセット利用画像が投稿されたとき
--   (2) 匿名通知: 利用の累計がちょうど節目に達したとき
-- を届ける。
--
-- 実装レビュー(#478)の指摘を反映済み:
--   指摘① (Critical): generated_images はクライアント INSERT/UPDATE 可能で
--     通知偽造が成立していた → INSERT ポリシーと権限を撤去し（正規の書き込みは
--     完了RPC=SECURITY DEFINER と wardrobe claim=service_role のみで、アプリに
--     クライアント INSERT はゼロを確認済み）、生成由来フィールドの UPDATE を
--     BEFORE トリガーで拒否する (ADR-007)
--   指摘②: 画像は物理削除できるため count(generated_images) は「累計」に
--     ならない → #477 の prompt_usage_events と同じ append-only の
--     style_preset_usage_events を正本にし、既存分をバックフィルする (ADR-003改)
--   指摘③: profiles.id = user_id は制約の無い偶然一致 → provider の
--     auth user id は profiles join で明示的に解決する (ADR-008)
--
-- provider の解決はクレジット表示 (resolveStylePresetProvider) と同一:
-- COALESCE(style_presets.provider_user_id, preset_categories.provider_user_id)。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. 生成由来フィールドの保護 (ADR-007 / レビュー指摘①)
-- ===============================================
-- 通知トリガーの信頼できる発生源にするため、generated_images の
-- 生成由来フィールドをクライアントから切り離す。
--
-- INSERT: 正規経路は完了RPC (SECURITY DEFINER) と wardrobe claim
-- (createAdminClient=service_role) のみ。アプリコードにクライアント INSERT が
-- 無いことを確認済みのため、ポリシーごと撤去する。
-- ここを塞ぐことで、record_style_preset_usage (後述) の発生源も信頼できる。

DROP POLICY IF EXISTS "Users can insert their own images"
  ON public.generated_images;

REVOKE INSERT ON public.generated_images FROM anon;
REVOKE INSERT ON public.generated_images FROM authenticated;

-- UPDATE: 投稿 (is_posted/caption 等) はブラウザ直 UPDATE の正規経路が
-- あるためポリシーは残し、生成由来フィールドの変更だけを拒否する。
-- enforce_generated_image_lineage が source 列で行っているのと同じ構図。

CREATE OR REPLACE FUNCTION public.enforce_generated_image_generation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_trusted_lineage_writer()
     AND (NEW.generation_type IS DISTINCT FROM OLD.generation_type
          OR NEW.generation_metadata IS DISTINCT FROM OLD.generation_metadata
          OR NEW.image_job_id IS DISTINCT FROM OLD.image_job_id
          OR NEW.style_template_id IS DISTINCT FROM OLD.style_template_id)
  THEN
    RAISE EXCEPTION
      '生成由来フィールド (generation_type / generation_metadata / image_job_id / style_template_id) はクライアントから変更できない';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_generated_image_generation_fields() IS
  '生成由来フィールドの改変による通知偽造 (style_preset_* / creator_looks_post_published) を防ぐ。信頼された書き込み (service_role / 直接続) のみ変更可 (ADR-007)';

DROP TRIGGER IF EXISTS trg_enforce_generated_image_generation_fields
  ON public.generated_images;
CREATE TRIGGER trg_enforce_generated_image_generation_fields
  BEFORE UPDATE OF generation_type, generation_metadata, image_job_id, style_template_id
  ON public.generated_images
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_generated_image_generation_fields();

-- ===============================================
-- 2. notifications.type の CHECK に2値を追加（20値）
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
-- 3. 利用イベントの正本テーブル (ADR-003改 / レビュー指摘②)
-- ===============================================
-- generated_images は本人が物理削除できるため「累計」の正本にならない。
-- #477 の prompt_usage_events と同じ append-only テーブルを正本にする。
-- FK は付けない（画像・ユーザーが消えても利用実績を保持する）。

CREATE TABLE IF NOT EXISTS public.style_preset_usage_events (
  generated_image_id UUID PRIMARY KEY,
  preset_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.style_preset_usage_events IS
  'One-Tap Style 生成の成功イベント（append-only）。節目通知の算出根拠。service_role のみアクセス可。generated_image_id PK で再発火時の重複を防ぐ。画像削除後も残る';

CREATE INDEX IF NOT EXISTS idx_style_preset_usage_events_preset
  ON public.style_preset_usage_events (preset_id);

ALTER TABLE public.style_preset_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.style_preset_usage_events FROM PUBLIC;
REVOKE ALL ON TABLE public.style_preset_usage_events FROM anon;
REVOKE ALL ON TABLE public.style_preset_usage_events FROM authenticated;

-- 既存の One-Tap 生成をバックフィルする。
-- ここでゼロベースラインが成立する: 節目判定は「ちょうど一致」のみのため、
-- 既に節目を超えているプリセットに遡って通知することはなく、次の節目から
-- 自然に再開する。バックフィルは節目トリガーの作成より前に行う（作成後に
-- 行うと1行ごとにトリガーが発火し、過去分の通知が出てしまう）。
INSERT INTO public.style_preset_usage_events
  (generated_image_id, preset_id, user_id, created_at)
SELECT
  gi.id,
  (gi.generation_metadata->'oneTapStyle'->>'id')::uuid,
  gi.user_id,
  gi.created_at
FROM public.generated_images gi
WHERE gi.generation_type = 'one_tap_style'
  AND gi.user_id IS NOT NULL
  AND (gi.generation_metadata->'oneTapStyle'->>'id')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (generated_image_id) DO NOTHING;

-- ===============================================
-- 4. generated_images のプリセット式インデックス (ADR-001)
-- ===============================================
-- 投稿時トリガーの WHEN 判定と運用時の逆引き用。現行約2,200行・作成はミリ秒。

CREATE INDEX IF NOT EXISTS idx_generated_images_one_tap_preset
ON public.generated_images ((generation_metadata->'oneTapStyle'->>'id'))
WHERE (generation_metadata->'oneTapStyle'->>'id') IS NOT NULL;

-- ===============================================
-- 5. 冪等化のユニークインデックス2本 (ADR-006)
-- ===============================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_style_preset_post_idx
ON public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
WHERE type = 'style_preset_post_published';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_style_preset_milestone_idx
ON public.notifications (((data->>'preset_id')), ((data->>'milestone')))
WHERE type = 'style_preset_usage_milestone';

-- ===============================================
-- 6. 利用イベントの記録トリガー
-- ===============================================
-- §1 で generated_images の INSERT は信頼された経路のみになったため、
-- ここから正本テーブルへ機械的に写す。wardrobe claim は metadata の形が
-- 異なる ({source, styleId}。oneTapStyle キーなし) ため WHEN に一致しない。

CREATE OR REPLACE FUNCTION public.record_style_preset_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- WHEN 句と同条件の再チェック（二重ガードの慣例）
  IF NEW.generation_type <> 'one_tap_style'
     OR NEW.generation_metadata->'oneTapStyle'->>'id' IS NULL
     OR NEW.user_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.style_preset_usage_events
    (generated_image_id, preset_id, user_id, created_at)
  VALUES (
    NEW.id,
    (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid,
    NEW.user_id,
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (generated_image_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 記録の失敗で生成完了 RPC を巻き込まない (REQ-007)
    RAISE WARNING 'Failed to record style preset usage: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.record_style_preset_usage() IS
  'One-Tap Style 生成を append-only の style_preset_usage_events へ記録する。節目通知の正本 (ADR-003改)';

DROP TRIGGER IF EXISTS trg_record_style_preset_usage
  ON public.generated_images;
CREATE TRIGGER trg_record_style_preset_usage
  AFTER INSERT ON public.generated_images
  FOR EACH ROW
  WHEN (NEW.generation_type = 'one_tap_style'
        AND (NEW.generation_metadata->'oneTapStyle'->>'id') IS NOT NULL)
  EXECUTE FUNCTION public.record_style_preset_usage();

-- ===============================================
-- 7. 実名通知トリガー（投稿時。REQ-001, 004, 007）
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
          AND NEW.generation_type = 'one_tap_style'
          AND NEW.generation_metadata->'oneTapStyle'->>'id' IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  v_preset_id := (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid;

  -- provider 解決はクレジット表示と同一規則 (ADR-002)。
  -- provider_user_id は profiles.id への FK であり、通知宛先 (auth.users.id)
  -- とは別列のため profiles.user_id を明示的に引く (ADR-008 / レビュー指摘③)。
  SELECT COALESCE(preset_provider.user_id, category_provider.user_id),
         sp.title, sp.slug
  INTO v_provider, v_preset_title, v_preset_slug
  FROM public.style_presets sp
  LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
  LEFT JOIN public.profiles preset_provider
    ON preset_provider.id = sp.provider_user_id
  LEFT JOIN public.profiles category_provider
    ON category_provider.id = pc.provider_user_id
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
        AND NEW.generation_type = 'one_tap_style'
        AND (NEW.generation_metadata->'oneTapStyle'->>'id') IS NOT NULL)
  EXECUTE FUNCTION public.notify_on_style_preset_post_published();

-- ===============================================
-- 8. 実名通知の削除トリガー（非公開化時。REQ-002, ADR-005）
-- ===============================================

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
        AND OLD.generation_type = 'one_tap_style'
        AND (OLD.generation_metadata->'oneTapStyle'->>'id') IS NOT NULL)
  EXECUTE FUNCTION public.delete_style_preset_post_notification();

-- ===============================================
-- 9. 匿名の節目通知トリガー（利用イベント記録時。REQ-003, 004, 007）
-- ===============================================
-- 発生源は append-only の style_preset_usage_events。バックフィル (§3) の
-- 後に作成しているため、過去分では発火しない。

CREATE OR REPLACE FUNCTION public.notify_on_style_preset_usage_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider UUID;
  v_preset_title TEXT;
  v_preset_slug TEXT;
  v_preset_thumbnail TEXT;
  v_count BIGINT;
BEGIN
  -- provider 解決 (ADR-002 / ADR-008)
  SELECT COALESCE(preset_provider.user_id, category_provider.user_id),
         sp.title, sp.slug, sp.thumbnail_image_url
  INTO v_provider, v_preset_title, v_preset_slug, v_preset_thumbnail
  FROM public.style_presets sp
  LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
  LEFT JOIN public.profiles preset_provider
    ON preset_provider.id = sp.provider_user_id
  LEFT JOIN public.profiles category_provider
    ON category_provider.id = pc.provider_user_id
  WHERE sp.id = NEW.preset_id;

  IF v_provider IS NULL THEN
    RETURN NEW;
  END IF;

  -- provider 自身の利用は数えず、通知もしない (REQ-004)
  IF NEW.user_id = v_provider THEN
    RETURN NEW;
  END IF;

  -- append-only の正本から通算（provider 除外）を数え、
  -- 「ちょうど節目」のときだけ発火する (ADR-003改)。
  -- 最大節目 1000 超過後は LIMIT 1001 で走査を打ち切る。
  SELECT count(*) INTO v_count
  FROM (
    SELECT 1
    FROM public.style_preset_usage_events
    WHERE preset_id = NEW.preset_id
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
      'preset_id', NEW.preset_id,
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
  'One-Tap Style 利用の累計（provider 除外・append-only 正本）が節目にちょうど達したとき、provider へ匿名の style_preset_usage_milestone 通知を作る (REQ-003/004/007)';

DROP TRIGGER IF EXISTS trg_notify_style_preset_usage_milestone
  ON public.style_preset_usage_events;
CREATE TRIGGER trg_notify_style_preset_usage_milestone
  AFTER INSERT ON public.style_preset_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_style_preset_usage_milestone();

-- ===============================================
-- 適用後の検証
-- ===============================================

DO $$
DECLARE
  v_constraint_def TEXT;
  v_backfill_expected BIGINT;
  v_backfill_actual BIGINT;
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

  -- レビュー指摘①: 偽造経路が閉じたことを機械検証する
  IF has_table_privilege('anon', 'public.generated_images', 'INSERT') THEN
    RAISE EXCEPTION 'anon が generated_images へ INSERT できてしまう';
  END IF;
  IF has_table_privilege('authenticated', 'public.generated_images', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated が generated_images へ INSERT できてしまう';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generated_images'
      AND policyname = 'Users can insert their own images'
  ) THEN
    RAISE EXCEPTION 'generated_images のクライアント INSERT ポリシーが残っている';
  END IF;

  IF (SELECT count(*) FROM pg_indexes
      WHERE indexname IN ('idx_generated_images_one_tap_preset',
                          'idx_style_preset_usage_events_preset',
                          'notifications_unique_style_preset_post_idx',
                          'notifications_unique_style_preset_milestone_idx')) <> 4
  THEN
    RAISE EXCEPTION '新設インデックス4本が揃っていない';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.generated_images'::regclass
        AND tgname IN ('trg_enforce_generated_image_generation_fields',
                       'trg_record_style_preset_usage',
                       'trg_notify_style_preset_post_published',
                       'trg_delete_style_preset_post_notification')) <> 4
  THEN
    RAISE EXCEPTION 'generated_images のトリガー4本が揃っていない';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.style_preset_usage_events'::regclass
      AND tgname = 'trg_notify_style_preset_usage_milestone'
  ) THEN
    RAISE EXCEPTION '節目トリガーが style_preset_usage_events に付いていない';
  END IF;

  -- バックフィルの整合: 対象行と同数のイベントが入っていること
  SELECT count(*) INTO v_backfill_expected
  FROM public.generated_images gi
  WHERE gi.generation_type = 'one_tap_style'
    AND gi.user_id IS NOT NULL
    AND (gi.generation_metadata->'oneTapStyle'->>'id')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT count(*) INTO v_backfill_actual
  FROM public.style_preset_usage_events;

  IF v_backfill_actual < v_backfill_expected THEN
    RAISE EXCEPTION 'バックフィルが不足している: expected >= %, actual %',
      v_backfill_expected, v_backfill_actual;
  END IF;

  RAISE NOTICE 'カタログ検証 OK（CHECK / INSERT封鎖 / インデックス4本 / トリガー5本 / バックフィル % 件）',
    v_backfill_actual;
END;
$$;

-- 実データ dry-run（必ずロールバックされるサブトランザクション。
-- aborted subtransaction は logical decoding 対象外のため Realtime へ漏れない）。
-- 一時カテゴリ＋一時プリセット（provider=実在ユーザー）を作り、
-- 記録→節目→実名→取消→画像削除の全経路をトリガー本体まで通す。
-- ※ マイグレーションは直接続 (= is_trusted_lineage_writer true) のため、
--   非信頼クライアントの拒否経路はここでは再現できない（ポリシー/権限の
--   撤去は上のカタログ検証で機械確認している）。

DO $$
DECLARE
  v_provider UUID;
  v_consumer UUID;
  v_category UUID;
  v_preset UUID;
  v_img1 UUID;
  v_img2 UUID;
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

    -- 1回目の生成 → イベント記録 + 「初めて」通知 (REQ-003, milestone=1)
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/spn-1.png', 'verify/spn-1.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)))
    RETURNING id INTO v_img1;

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events
    WHERE preset_id = v_preset;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '1回目の生成で利用イベントが1件でない: %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '1回目の生成で節目通知が1件でない: %', v_count;
    END IF;

    -- 2〜4回目 → 通知は増えない
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

    -- 画像を1枚物理削除しても累計は減らない (レビュー指摘②)
    DELETE FROM public.generated_images WHERE id = v_img1;

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events
    WHERE preset_id = v_preset;
    IF v_count <> 4 THEN
      RAISE EXCEPTION '画像削除で利用イベントが減ってしまった: %', v_count;
    END IF;

    -- 5回目 → 2件目（milestone=5）。削除に影響されず通算で判定される
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/spn-5.png', 'verify/spn-5.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)))
    RETURNING id INTO v_img2;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text;
    IF v_count <> 2 THEN
      RAISE EXCEPTION '5回目の生成で節目通知が2件にならない: %', v_count;
    END IF;

    -- provider 自身の生成 → 通知は不変 (REQ-004)
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
    UPDATE public.generated_images SET is_posted = true WHERE id = v_img2;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_post_published'
      AND entity_id = v_img2
      AND recipient_id = v_provider
      AND actor_id = v_consumer;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '投稿で実名通知が1件でない: %', v_count;
    END IF;

    -- 取消 → 実名通知だけ消え、節目通知は残る (REQ-002 / ADR-005)
    UPDATE public.generated_images SET is_posted = false WHERE id = v_img2;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_post_published' AND entity_id = v_img2;
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
      RAISE NOTICE '実データ dry-run OK（記録→初回→非節目→画像削除で不減→5回→自己除外→実名通知→取消で実名のみ削除）。変更はすべてロールバックした';
    -- 他の例外は捕捉しない = assert 失敗はマイグレーションを失敗させる
  END;
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notify_style_preset_usage_milestone ON public.style_preset_usage_events;
-- DROP TRIGGER IF EXISTS trg_record_style_preset_usage ON public.generated_images;
-- DROP TRIGGER IF EXISTS trg_notify_style_preset_post_published ON public.generated_images;
-- DROP TRIGGER IF EXISTS trg_delete_style_preset_post_notification ON public.generated_images;
-- DROP TRIGGER IF EXISTS trg_enforce_generated_image_generation_fields ON public.generated_images;
-- DROP FUNCTION IF EXISTS public.notify_on_style_preset_usage_milestone();
-- DROP FUNCTION IF EXISTS public.record_style_preset_usage();
-- DROP FUNCTION IF EXISTS public.notify_on_style_preset_post_published();
-- DROP FUNCTION IF EXISTS public.delete_style_preset_post_notification();
-- DROP FUNCTION IF EXISTS public.enforce_generated_image_generation_fields();
-- DROP INDEX IF EXISTS public.idx_generated_images_one_tap_preset;
-- DROP INDEX IF EXISTS public.notifications_unique_style_preset_post_idx;
-- DROP INDEX IF EXISTS public.notifications_unique_style_preset_milestone_idx;
-- -- style_preset_usage_events の DROP は利用実績の喪失を意味するため非推奨。
-- -- DROP TABLE IF EXISTS public.style_preset_usage_events;
-- -- INSERT ポリシー/権限の復元は通知偽造経路の再開通を意味するため非推奨
-- -- （戻す場合は CREATE POLICY "Users can insert their own images" ... と
-- --   GRANT INSERT を個別に）。
-- -- 既存通知の全消去（必要な場合のみ）:
-- -- DELETE FROM public.notifications WHERE type IN ('style_preset_post_published','style_preset_usage_milestone');
-- -- CHECK 制約は該当行を消した後でないと旧18値へ戻せない。
-- COMMIT;
-- ===============================================
