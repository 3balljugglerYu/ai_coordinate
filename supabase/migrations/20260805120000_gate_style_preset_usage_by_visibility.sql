-- ===============================================
-- One-Tap Style クリエイター通知: 公開前のテスト生成を除外する
-- ===============================================
-- 計画: docs/planning/style-preset-creator-notification-implementation-plan.md ADR-009
--
-- 運営はプリセットの一般公開前に、admin_only カテゴリや非公開
-- （status <> 'published'）のプリセットでテスト生成を行う。20260805000000 の
-- 実装ではこれも利用イベントとして記録されるため、
--   (1) provider 設定済みなら節目通知が運営テストで発火する
--   (2) provider 未設定でもイベントが累計を先に消費し、公開後の実ユーザーの
--       「初めて」通知が欠落する（節目1は一度しか交差しないため、早まるの
--       ではなく完全に失われる）
-- という汚染が起きる。
--
-- 対策は「記録時点ゲート」方式: 生成された瞬間の公開状態
--   プリセット status = 'published'
--   かつ カテゴリ visibility = 'public'
--   かつ カテゴリ is_active = true
--   かつ カテゴリ表示期間内（[starts, ends)。アプリ側の公開判定
--        20260610130000 と同一の境界）
-- を満たす生成だけを利用実績として記録・通知する。
-- published_at 境界方式と違い、カテゴリの admin_only→public 切替や
-- 予約公開の開始・終了の時刻を別途持たなくても時系列的に正確
--（発火時点の状態がそのまま答えになる）。
--
-- 実名の投稿通知は「投稿時点で公開中」かつ「生成時点でも適格だった」の
-- 両方を要求する。生成時点の適格性は style_preset_usage_events の行の
-- 存在を永続的な証跡として使う（公開前のテスト生成にはイベントが無い）。
-- これにより「公開前に生成したテスト画像をローンチ後に投稿する」運用でも
-- クリエイターへ通知が飛ばない。
--
-- 既に記録済みの過去イベント（20260805000000 のバックフィル分を含む）は
-- すべて残置する。published_at IS NULL は「未公開または移行前データ」
-- （20260721120000 の列コメント）であり、公開→draft 戻しや
-- delete_style_preset_and_reorder による物理削除を経た正規利用と
-- テスト由来を機械的に区別できないため、自動削除はしない。
-- 特定プリセットのローンチ前にテストイベントを掃除したい場合は、
-- 運用で当該プリセットが一度も公開されていないことを確認のうえ、
-- preset_id を明示した DELETE を個別に実行する（既に節目通知が発行済みの
-- 場合は通知側のユニークインデックス行も残るため、「初めて」の復元には
-- 通知行の削除も必要になる点に注意）。
-- 残したテストイベントがあるプリセットでは「初めて」通知が出ず、
-- 以後の節目も実利用より早く到達する制約が残る。
--
-- 過去イベントは生成時点の公開状態を証明できないため、
-- was_public_at_generation 列（既定 false）を追加し、本ゲート適用後の
-- 記録だけを true にする。実名通知はこのフラグを要求することで、
-- バックフィル時代のテスト画像（例: admin_only カテゴリ × published
-- プリセット）を公開後に投稿しても通知されない。節目の累計には
-- フラグに関係なく全イベントを数える（append-only の通算を維持）。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. 生成時点の適格性を示す永続フラグ
-- ===============================================
-- 既定 false のため、バックフィル済みの既存行はすべて「証明なし」になる。

ALTER TABLE public.style_preset_usage_events
  ADD COLUMN IF NOT EXISTS was_public_at_generation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.style_preset_usage_events.was_public_at_generation IS
  '生成時点で公開中（ADR-009 のゲート通過）だったことの永続証跡。ゲート適用後の記録のみ true。実名通知はこれを要求し、節目の累計はフラグに関係なく数える';

-- ===============================================
-- 2. 記録トリガー関数: 公開中の生成のみ記録する
-- ===============================================

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

  -- 公開中の生成だけを利用実績にする (ADR-009)。
  -- 条件はアプリ側の公開判定 (20260610130000) と同一:
  -- published × visibility='public' × is_active × 表示期間 [starts, ends)。
  -- 運営の公開前・期間外テストはカウントも通知もされない。
  IF NOT EXISTS (
    SELECT 1
    FROM public.style_presets sp
    JOIN public.preset_categories pc ON pc.id = sp.category_id
    WHERE sp.id = (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid
      AND sp.status = 'published'
      AND pc.visibility = 'public'
      AND pc.is_active = true
      AND (pc.collection_display_starts_at IS NULL
           OR now() >= pc.collection_display_starts_at)
      AND (pc.collection_display_ends_at IS NULL
           OR now() < pc.collection_display_ends_at)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.style_preset_usage_events
    (generated_image_id, preset_id, user_id, created_at, was_public_at_generation)
  VALUES (
    NEW.id,
    (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid,
    NEW.user_id,
    COALESCE(NEW.created_at, now()),
    true
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
  'One-Tap Style 生成を append-only の style_preset_usage_events へ記録する。公開中（preset published × カテゴリ public/有効 × 表示期間内）の生成のみ対象 (ADR-003改/ADR-009)';

-- ===============================================
-- 3. 実名通知関数: 公開中かつ生成時点でも適格な場合のみ通知する
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
  v_is_public BOOLEAN;
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
  -- provider_user_id は profiles.id への FK のため profiles.user_id を
  -- 明示的に引く (ADR-008)。公開状態も同時に取得する (ADR-009)。
  SELECT COALESCE(preset_provider.user_id, category_provider.user_id),
         sp.title, sp.slug,
         (sp.status = 'published'
          AND pc.visibility = 'public'
          AND pc.is_active = true
          AND (pc.collection_display_starts_at IS NULL
               OR now() >= pc.collection_display_starts_at)
          AND (pc.collection_display_ends_at IS NULL
               OR now() < pc.collection_display_ends_at))
  INTO v_provider, v_preset_title, v_preset_slug, v_is_public
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

  -- 投稿時点で公開中、かつ生成時点でも適格（= ゲート通過の証跡
  -- was_public_at_generation=true のイベントが存在する）場合だけ通知する
  -- (ADR-009)。公開前に生成したテスト画像は、バックフィル時代の行
  -- （フラグ false）を含めて公開後に投稿しても通知しない。
  IF v_is_public IS DISTINCT FROM true
     OR NOT EXISTS (
       SELECT 1
       FROM public.style_preset_usage_events e
       WHERE e.generated_image_id = NEW.id
         AND e.was_public_at_generation = true
     )
  THEN
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
    RAISE WARNING 'Failed to create style preset post notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_style_preset_post_published() IS
  'One-Tap Style プリセット利用画像の投稿時、provider へ実名の style_preset_post_published 通知を作る。投稿時点で公開中かつ生成時点でも適格（利用イベントが存在）な場合のみ。自己利用・双方向ブロックはスキップ (REQ-001/004/007, ADR-009)';

-- ===============================================
-- 適用後の検証
-- ===============================================

DO $$
BEGIN
  IF to_regprocedure('public.record_style_preset_usage()') IS NULL
     OR to_regprocedure('public.notify_on_style_preset_post_published()') IS NULL
  THEN
    RAISE EXCEPTION '再定義対象の関数が存在しない';
  END IF;

  IF position('collection_display_starts_at' in
       pg_get_functiondef('public.record_style_preset_usage()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'record_style_preset_usage に表示期間ゲートが入っていない';
  END IF;

  IF position('collection_display_starts_at' in
       pg_get_functiondef('public.notify_on_style_preset_post_published()'::regprocedure)) = 0
     OR position('was_public_at_generation' in
       pg_get_functiondef('public.notify_on_style_preset_post_published()'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'notify_on_style_preset_post_published に公開状態/生成時適格性ゲートが入っていない';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'style_preset_usage_events'
      AND column_name = 'was_public_at_generation'
  ) THEN
    RAISE EXCEPTION 'was_public_at_generation 列が存在しない';
  END IF;

  -- 既存（バックフィル）行はすべて「証明なし」のままであること
  IF EXISTS (
    SELECT 1 FROM public.style_preset_usage_events
    WHERE was_public_at_generation = true
  ) THEN
    RAISE EXCEPTION '適用時点で was_public_at_generation=true の行が存在する';
  END IF;

  RAISE NOTICE 'カタログ検証 OK（関数2本の再定義・ゲートの存在・適格性フラグ列）';
END;
$$;

-- 実データ dry-run（必ずロールバックされるサブトランザクション。
-- Realtime へ漏れず、データも残らない）。公開状態・表示期間・有効フラグの
-- 遷移ごとに記録・通知が正しくゲートされることを本体まで通す。

DO $$
DECLARE
  v_provider UUID;
  v_consumer UUID;
  v_category UUID;
  v_preset UUID;
  v_img_public UUID;
  v_img_hidden UUID;
  v_count INT;
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
    -- admin_only カテゴリ + published プリセット（= 公開前テストの典型形）
    INSERT INTO public.preset_categories (key, display_name_ja, display_name_en, visibility, is_active)
    VALUES ('verify-gate-cat', '検証用', 'verify', 'admin_only', true)
    RETURNING id INTO v_category;

    INSERT INTO public.style_presets
      (slug, title, thumbnail_image_url, thumbnail_width, thumbnail_height,
       styling_prompt, category_id, image_input_mode, status, provider_user_id, published_at)
    VALUES
      ('verify-gate-preset', '検証用スタイル', 'https://example.invalid/gate-thumb.png', 100, 100,
       'verify', v_category, 'single', 'published', v_provider, now())
    RETURNING id INTO v_preset;

    -- (1) カテゴリ admin_only 中の生成 → 記録されない
    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/gate-1.png', 'verify/gate-1.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)))
    RETURNING id INTO v_img_hidden;

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events WHERE preset_id = v_preset;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'admin_only カテゴリの生成が記録されてしまった: %', v_count;
    END IF;

    -- (2) public 化したが表示期間の開始前 → 記録されない（予約公開のテスト）
    UPDATE public.preset_categories
    SET visibility = 'public',
        collection_display_starts_at = now() + interval '1 hour'
    WHERE id = v_category;

    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/gate-2.png', 'verify/gate-2.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events WHERE preset_id = v_preset;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '表示期間の開始前の生成が記録されてしまった: %', v_count;
    END IF;

    -- (3) 表示期間内 → 記録され「初めて」通知が出る
    UPDATE public.preset_categories
    SET collection_display_starts_at = now() - interval '1 hour',
        collection_display_ends_at = now() + interval '1 hour'
    WHERE id = v_category;

    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/gate-3.png', 'verify/gate-3.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)))
    RETURNING id INTO v_img_public;

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events WHERE preset_id = v_preset;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '表示期間内の生成が記録されない: %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_usage_milestone'
      AND data->>'preset_id' = v_preset::text
      AND data->>'milestone' = '1';
    IF v_count <> 1 THEN
      RAISE EXCEPTION '公開後の初回生成で「初めて」通知が出ない: %', v_count;
    END IF;

    -- (4) 表示期間の終了後 → 記録されない
    UPDATE public.preset_categories
    SET collection_display_ends_at = now() - interval '1 minute'
    WHERE id = v_category;

    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/gate-4.png', 'verify/gate-4.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events WHERE preset_id = v_preset;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '表示期間の終了後の生成が記録されてしまった: %', v_count;
    END IF;

    -- (5) 期間を戻し is_active=false → 記録されない
    UPDATE public.preset_categories
    SET collection_display_ends_at = NULL,
        is_active = false
    WHERE id = v_category;

    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/gate-5.png', 'verify/gate-5.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events WHERE preset_id = v_preset;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'is_active=false カテゴリの生成が記録されてしまった: %', v_count;
    END IF;

    UPDATE public.preset_categories SET is_active = true WHERE id = v_category;

    -- (6) プリセット非公開中の生成 → 記録されない
    UPDATE public.style_presets SET status = 'draft' WHERE id = v_preset;

    INSERT INTO public.generated_images
      (user_id, image_url, storage_path, prompt, is_posted, generation_type, generation_metadata)
    VALUES
      (v_consumer, 'https://example.invalid/gate-6.png', 'verify/gate-6.png', '', false, 'one_tap_style',
       jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset)));

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events WHERE preset_id = v_preset;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '非公開プリセットの生成が記録されてしまった: %', v_count;
    END IF;

    -- (7) バックフィル相当のイベント（フラグ false）を持つ「公開前に生成した
    --     画像」を、再公開後に投稿 → 実名通知は出ない
    --     （生成時点の適格性 = was_public_at_generation=true の証跡が無いため。
    --      レビュー指摘②とバックフィル行の穴の両方をここで固定する）
    UPDATE public.style_presets SET status = 'published' WHERE id = v_preset;

    INSERT INTO public.style_preset_usage_events
      (generated_image_id, preset_id, user_id, created_at)
    VALUES (v_img_hidden, v_preset, v_consumer, now());

    SELECT count(*) INTO v_count
    FROM public.style_preset_usage_events
    WHERE preset_id = v_preset;
    IF v_count <> 2 THEN
      RAISE EXCEPTION 'バックフィル相当イベントの投入後の件数が想定外: %', v_count;
    END IF;

    UPDATE public.generated_images SET is_posted = true WHERE id = v_img_hidden;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_post_published' AND entity_id = v_img_hidden;
    IF v_count <> 0 THEN
      RAISE EXCEPTION '公開前に生成した画像（フラグ false のイベント持ち）の投稿で実名通知が出てしまった: %', v_count;
    END IF;

    -- (8) 公開中に生成した画像の投稿 → 実名通知が出る
    UPDATE public.generated_images SET is_posted = true WHERE id = v_img_public;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE type = 'style_preset_post_published'
      AND entity_id = v_img_public
      AND recipient_id = v_provider;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '公開中プリセットの投稿で実名通知が出ない: %', v_count;
    END IF;

    -- 検証成功。サブトランザクションごと必ず巻き戻す
    RAISE EXCEPTION USING ERRCODE = 'PT999';
  EXCEPTION
    WHEN SQLSTATE 'PT999' THEN
      RAISE NOTICE '実データ dry-run OK（admin_only/期間前/期間後/is_active=false/非公開は無反応・公開中は記録+初回通知・フラグfalseイベント持ち画像の後日投稿は通知なし・公開中生成の投稿は実名通知）。変更はすべてロールバックした';
    -- 他の例外は捕捉しない = assert 失敗はマイグレーションを失敗させる
  END;
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- -- record_style_preset_usage / notify_on_style_preset_post_published を
-- -- 20260805000000 の定義（公開状態ゲートなし）へ戻す。
-- -- ALTER TABLE public.style_preset_usage_events
-- --   DROP COLUMN IF EXISTS was_public_at_generation;
-- COMMIT;
-- ===============================================
