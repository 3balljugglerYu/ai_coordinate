-- ===============================================
-- コレクション完走のホームフィード投稿(オプトイン) Phase 1: DB
-- ===============================================
-- 計画: docs/planning/collection-completion-feed-post-implementation-plan.md
--
-- 完走(collection_completions)を、ユーザー任意で「posts(= generated_images)」の1行として
-- フィードに出せるようにする。いいね/コメント/モデレーション/投稿ボーナス/フィード取得は
-- すべて generated_images.id 起点のため、完走を1行で表現すれば無改修で流用できる。
--
-- 設計判断(計画 ADR / MRAR 反映):
--  - 識別子 `completion_id`(→ collection_completions.id)。バッジ/タップ先/重複判定に使う。
--  - 重複投稿防止は completion_id の部分 UNIQUE(1完走=1post、RPCは冪等)。
--  - タップ先(mount/book)解決のため `completion_view_mode` を **post 行に非正規化**保存する。
--    collection_completions は本人のみ RLS のため、他者のフィードでは join しても NULL になる。
--    post 行(generated_images)は公開 read 可なので、ここに持たせるのが公開安全かつ join 不要。
--  - generation_type='one_tap_style'(プロンプト秘匿の defense-in-depth)、generation_metadata=NULL
--    (コレクションクエリは metadata->oneTapStyle->>id の AND 条件のため除外され安全)。
--  - posted_at=now()(NULL だと NULLS FIRST で新着先頭固定 + 時間タブ除外になるため必須)。
-- ===============================================

-- 1) 列追加: 完走への逆引きと、タップ先解決用の view mode スナップショット
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS completion_id UUID NULL
    REFERENCES public.collection_completions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_view_mode TEXT NULL
    CHECK (completion_view_mode IN ('mount', 'book'));

COMMENT ON COLUMN public.generated_images.completion_id IS '完走投稿の場合の collection_completions.id。NULL は通常の生成画像投稿';
COMMENT ON COLUMN public.generated_images.completion_view_mode IS '完走投稿のタップ先解決用(mount=台紙 / book=本)。post行に非正規化保存(公開read可・join不要)';

-- 2) 1完走=1post(重複投稿防止)。RPC はこの制約を前提に冪等動作する。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_generated_images_completion_id
  ON public.generated_images (completion_id)
  WHERE completion_id IS NOT NULL;

-- 3) RPC: 完走を post として作成/再活性化(所有権を DB 層で強制・冪等・ボーナス付与)
--    p_user_id は受け取らず auth.uid() で解決(クライアント body 不可)。
--    画像列(image_url/storage_path/display/thumb)は呼び出し側 helper が WebP 確保後に渡す。
--    呼び出しは「セッションクライアント」経由のこと(admin client だと auth.uid() が NULL)。
CREATE OR REPLACE FUNCTION public.create_collection_completion_post(
  p_completion_id uuid,
  p_caption text,
  p_image_url text,
  p_storage_path text,
  p_storage_path_display text,
  p_storage_path_thumb text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_view_mode text;
  v_existing_id uuid;
  v_existing_posted boolean;
  v_post_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- 完走の所有者・状態・view mode(カテゴリ由来)を取得
  SELECT cc.user_id, cc.mount_status, pc.completion_view_mode
    INTO v_owner, v_status, v_view_mode
    FROM public.collection_completions cc
    JOIN public.preset_categories pc ON pc.id = cc.category_id
    WHERE cc.id = p_completion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'completion not found';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'forbidden: not completion owner';
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'completion not completed';
  END IF;

  -- 冪等: 同一 completion の既存 post があれば再活性化(取消後の再投稿)or そのまま返す
  SELECT id, is_posted INTO v_existing_id, v_existing_posted
    FROM public.generated_images
    WHERE completion_id = p_completion_id;

  IF FOUND THEN
    v_post_id := v_existing_id;
    IF NOT v_existing_posted THEN
      UPDATE public.generated_images
        SET is_posted = true,
            posted_at = now(),
            moderation_status = 'visible',
            caption = p_caption,
            completion_view_mode = v_view_mode
        WHERE id = v_post_id;
    END IF;
  ELSE
    INSERT INTO public.generated_images (
      user_id, image_url, storage_path, storage_path_display, storage_path_thumb,
      prompt, caption, is_posted, posted_at, moderation_status,
      generation_type, generation_metadata, completion_id, completion_view_mode
    ) VALUES (
      v_uid, p_image_url, p_storage_path, p_storage_path_display, p_storage_path_thumb,
      '', p_caption, true, now(), 'visible',
      'one_tap_style', NULL, p_completion_id, v_view_mode
    )
    RETURNING id INTO v_post_id;
  END IF;

  -- 日次投稿ボーナス(1日1回 JST・同一 generation_id でべき等)
  PERFORM public.grant_daily_post_bonus(v_uid, v_post_id);

  RETURN v_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_collection_completion_post(uuid, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_collection_completion_post(uuid, text, text, text, text, text)
  IS '完走(collection_completions)を generated_images の1行として投稿/再活性化する。所有権を auth.uid() で強制、completion_id 部分UNIQUEで冪等、日次投稿ボーナスを付与';

-- ===============================================
-- DOWN(手動):
--   DROP FUNCTION IF EXISTS public.create_collection_completion_post(uuid, text, text, text, text, text);
--   DROP INDEX IF EXISTS public.uniq_generated_images_completion_id;
--   ALTER TABLE public.generated_images
--     DROP COLUMN IF EXISTS completion_view_mode,
--     DROP COLUMN IF EXISTS completion_id;
-- ===============================================
