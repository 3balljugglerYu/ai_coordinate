-- ===============================================
-- 本人は未投稿の自分の生成物からも派生生成できるようにする
-- ===============================================
-- マイページから自分の未投稿の生成物を開くと、参照カードが
-- 「現在、ご利用できません」になっていた。自分のプロンプトなのに使えないのは
-- おかしいので、本人に限って `is_posted` を問わないようにする。
--
-- 未投稿は「まだ公開していない自分の下書き」でしかなく、第三者へは渡らない。
-- 他人が未投稿の投稿 ID を渡しても、`user_id <> p_requester_id` で従来どおり
-- 弾かれる。投稿詳細の取得 (getPost) も未投稿は本人と管理者にしか返さない。
--
-- **moderation_status は本人でも緩めない。** 公開停止になった内容から
-- 作り直せてしまうと措置の意味がなくなる。
--
-- 変更するのは is_posted の条件だけで、他（free・root・secret 存在・
-- 原作者の利用可否・フォロー・双方向ブロック・prompt_visibility の値域）は
-- そのまま残す。
--
-- 元の意図（公開プロンプトも原作にできるようにする）は
-- docs/planning/free-prompt-private-mode-implementation-plan.md ADR-006 / REQ-008。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.validate_derived_prompt_source(
  p_source_post_id uuid,
  p_requester_id uuid
)
RETURNS TABLE (
  is_available boolean,
  root_post_id uuid,
  origin_author_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_post public.generated_images%ROWTYPE;
  v_root public.generated_images%ROWTYPE;
BEGIN
  -- 利用不可の理由は呼び出し側へ返さない。削除・投稿取消・公開停止・
  -- 非公開解除のどれであっても同じ結果にする (ADR-005)。
  -- 理由を返すと、そこから原作の状態を推測できてしまう。
  IF p_source_post_id IS NULL OR p_requester_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_post
  FROM public.generated_images
  WHERE id = p_source_post_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 派生 ID を渡された場合は根へ解決する
  IF v_post.source_post_id IS NOT NULL THEN
    SELECT * INTO v_root
    FROM public.generated_images
    WHERE id = v_post.source_post_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    v_root := v_post;
  END IF;

  -- prompt_visibility は問わない。公開・非公開のどちらも原作にできる。
  -- 想定外の値が入っていたら通さない（列の CHECK と二重にする）。
  -- 投稿済みであること。ただし本人が自分の生成物を使う場合は問わない。
  -- user_id IS NULL を先に見ているので、以降の比較は非 NULL 同士になる。
  IF v_root.user_id IS NULL
     OR (v_root.is_posted IS NOT TRUE AND v_root.user_id <> p_requester_id)
     OR v_root.moderation_status <> 'visible'
     OR v_root.generation_type <> 'free'
     OR v_root.prompt_visibility NOT IN ('public', 'private')
     OR v_root.source_post_id IS NOT NULL
  THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- author secret が無ければ解決できない
  IF NOT EXISTS (
    SELECT 1
    FROM public.generated_image_prompt_secrets
    WHERE image_id = v_root.id
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 原作者のアカウントが削除予定なら利用不可
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_root.user_id
      AND deletion_scheduled_at IS NOT NULL
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 双方向いずれのブロック関係も不可
  IF EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE (blocker_id = v_root.user_id AND blocked_id = p_requester_id)
       OR (blocker_id = p_requester_id AND blocked_id = v_root.user_id)
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 本人、またはフォロワーだけが使える
  IF v_root.user_id <> p_requester_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.follows
       WHERE follower_id = p_requester_id
         AND followee_id = v_root.user_id
     )
  THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_root.id, v_root.user_id;
END;
$function$;

COMMENT ON FUNCTION public.validate_derived_prompt_source(uuid, uuid) IS
  '派生生成の原作が使えるかを判定する。本文も理由も返さない。公開・非公開どちらの free root 投稿も原作にでき、本人は未投稿の自分の生成物も使える';

REVOKE ALL ON FUNCTION public.validate_derived_prompt_source(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_derived_prompt_source(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.validate_derived_prompt_source(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_derived_prompt_source(uuid, uuid) TO service_role;

-- ===============================================
-- 適用後の検証
-- ===============================================
-- 既存の非公開経路が壊れていないこと、公開が通るようになったことを、
-- 実データではなく関数の到達性で確認する。実在しない ID なら副作用は無い。

DO $$
DECLARE
  v_available boolean;
  v_post uuid;
  v_author uuid;
BEGIN
  SELECT is_available INTO v_available
  FROM public.validate_derived_prompt_source(
    '00000000-0000-4000-8000-000000000000'::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );

  IF v_available IS NOT FALSE THEN
    RAISE EXCEPTION '存在しない原作が利用可能と判定された';
  END IF;

  -- 早期 return では列名の誤りを検出できない。実在する free の root 投稿で
  -- フォロー判定まで到達させ、関数本体が最後まで実行できることを確かめる。
  SELECT id, user_id INTO v_post, v_author
  FROM public.generated_images
  WHERE generation_type = 'free'
    AND is_posted = true
    AND moderation_status = 'visible'
    AND source_post_id IS NULL
  LIMIT 1;

  IF v_post IS NOT NULL THEN
    -- 本人を requester にすると、フォロー判定を含む全条件を通過して true になる
    SELECT is_available INTO v_available
    FROM public.validate_derived_prompt_source(v_post, v_author);

    IF v_available IS NOT TRUE THEN
      RAISE EXCEPTION
        '実在する free root 投稿 % を本人が使えない判定になった', v_post;
    END IF;
  END IF;

  -- 本人の未投稿でも使えること。ここが false のままだと、マイページの
  -- 参照カードが「現在、ご利用できません」に戻る。
  SELECT id, user_id INTO v_post, v_author
  FROM public.generated_images
  WHERE generation_type = 'free'
    AND is_posted = false
    AND moderation_status = 'visible'
    AND source_post_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.generated_image_prompt_secrets s WHERE s.image_id = id
    )
  LIMIT 1;

  IF v_post IS NOT NULL THEN
    SELECT is_available INTO v_available
    FROM public.validate_derived_prompt_source(v_post, v_author);

    IF v_available IS NOT TRUE THEN
      RAISE EXCEPTION '未投稿の自分の生成物 % を本人が使えない判定になった', v_post;
    END IF;

    -- 他人からは従来どおり使えないこと
    SELECT is_available INTO v_available
    FROM public.validate_derived_prompt_source(
      v_post, '00000000-0000-4000-8000-00000000000f'::uuid
    );

    IF v_available IS NOT FALSE THEN
      RAISE EXCEPTION '未投稿の生成物 % が他人から使える判定になった', v_post;
    END IF;
  END IF;

  RAISE NOTICE '本人は未投稿の自分の生成物からも派生生成できるようにした';
END;
$$;

-- 関数を差し替えたので Data API のキャッシュを再読み込みさせる
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- -- 20260730200100 の定義（prompt_visibility <> 'private' で弾く版）へ戻す
-- COMMIT;
-- ===============================================
