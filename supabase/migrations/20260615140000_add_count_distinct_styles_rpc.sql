-- 解放ゲート(unlock gating)の段階解放判定用に、カテゴリ key ごとの
-- distinct な生成体数(oneTapStyle.id の DISTINCT 数)を DB 側で集計する RPC。
--
-- 背景:
--   以前は image_jobs を select してアプリ側でメモリ集計していたが、
--   PostgREST のデフォルト行制限(1000行)に達すると不正確になり得るうえ、
--   メモリ/帯域の無駄にもなる(Gemini レビュー指摘)。
--   既存の get_collection_progress と同じ集計ロジックを DB 側で完結させる。
--
-- セキュリティ:
--   finalize/fail_collection_completion と同様、p_user_id を引数で受ける
--   service_role 専用関数とする(サーバー route が認証済み user.id を渡して
--   admin client で呼ぶ前提)。authenticated/anon からの直接実行は許可しない。

CREATE OR REPLACE FUNCTION public.count_distinct_styles_by_category(
  p_user_id UUID,
  p_category_keys TEXT[]
)
RETURNS TABLE (
  category_key TEXT,
  unique_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ij.style_preset_category_key AS category_key,
    COUNT(DISTINCT ij.generation_metadata -> 'oneTapStyle' ->> 'id')::INTEGER AS unique_count
  FROM public.image_jobs ij
  WHERE ij.user_id = p_user_id
    AND ij.style_preset_category_key = ANY (p_category_keys)
    AND ij.status = 'succeeded'
    AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL
  GROUP BY ij.style_preset_category_key;
$$;

REVOKE ALL ON FUNCTION public.count_distinct_styles_by_category(UUID, TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_styles_by_category(UUID, TEXT[])
  TO service_role;

COMMENT ON FUNCTION public.count_distinct_styles_by_category(UUID, TEXT[]) IS
  'service_role route 専用。指定ユーザーの、カテゴリkeyごとの distinct な oneTapStyle.id 生成体数を返す(解放ゲートの段階解放判定用)。';
