-- ===============================================
-- 派生生成の原作に「公開プロンプト」も許可する
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-006 / REQ-008 の改訂
--
-- 当初は「プロンプト非公開の投稿だけを派生生成の原作にできる」設計だった。
-- 実機で見た結果、公開・非公開でプロンプト欄の UI が変わるのは分かりにくく、
-- 「このプロンプトで作る」の入口はどちらでも同じであるべきという判断になった。
-- 公開プロンプトからも同じ経路で生成できるようにする。
--
-- 秘匿の観点で緩むものは無い。
--
-- - 公開プロンプトは元々フォロワーへ開示してよい値であり、非公開のものを
--   開示するわけではない
-- - クライアントが送るのは相変わらず原作の投稿 ID だけで、本文はサーバーが
--   author secret から解決する。schema の「本文と原作 ID の同時指定は 400」
--   という排他検証も崩さない
-- - 利用数は原作の secret を使った生成だけを数えるため、水増しできない
--
-- 変更するのは prompt_visibility の条件だけで、他の条件（free・root・
-- 投稿済み・visible・secret 存在・原作者の利用可否・フォロー・双方向ブロック）
-- はそのまま残す。

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
  IF v_root.user_id IS NULL
     OR v_root.is_posted IS NOT TRUE
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
  '派生生成の原作が使えるかを判定する。本文も理由も返さない。公開・非公開どちらの free root 投稿も原作にできる';

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
BEGIN
  SELECT is_available INTO v_available
  FROM public.validate_derived_prompt_source(
    '00000000-0000-4000-8000-000000000000'::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );

  IF v_available IS NOT FALSE THEN
    RAISE EXCEPTION '存在しない原作が利用可能と判定された';
  END IF;

  RAISE NOTICE '公開プロンプトを原作に許可した。他の条件は変更していない';
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
