-- ===============================================
-- コレクション進捗カードの表示期間
-- ===============================================
-- コラボ企画などの期間運用向けに、進捗カード(マイページ)・進捗モーダルの
-- 表示期間をカテゴリ単位で設定できるようにする。NULL は「制限なし」。
--
-- 期間の影響範囲:
--   - get_collection_progress_for_user: 一般ユーザーには期間内のみ返す
--     (admin はプレビューとして期間外も見える)
--   - /api/collections/options, /api/collections/mount: server route 側で
--     「期間内 または 達成済み(completed)ユーザー」のみ許可
-- 影響させないもの:
--   - /style での生成可否(従来どおり is_active / visibility / preset status で制御)
--   - 完了サムネ(collection_completions 直参照)・公開シェアページ
-- ===============================================

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS collection_display_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collection_display_ends_at TIMESTAMPTZ;

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_collection_display_period_check;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_collection_display_period_check
  CHECK (
    collection_display_starts_at IS NULL
    OR collection_display_ends_at IS NULL
    OR collection_display_starts_at < collection_display_ends_at
  );

COMMENT ON COLUMN public.preset_categories.collection_display_starts_at IS
  'コレクション進捗カードの表示開始日時(NULL=制限なし)。/style の生成可否には影響しない';
COMMENT ON COLUMN public.preset_categories.collection_display_ends_at IS
  'コレクション進捗カードの表示終了日時(NULL=制限なし)。終了後も達成済みユーザーの台紙更新・完了サムネ・シェアは可能';

-- 進捗 RPC に表示期間フィルタを追加(一般ユーザーのみ。admin プレビューは期間外も返す)
CREATE OR REPLACE FUNCTION public.get_collection_progress_for_user(
  p_user_id UUID,
  p_include_admin_only BOOLEAN
)
RETURNS TABLE (
  category_id UUID,
  category_key TEXT,
  display_name_ja TEXT,
  display_name_en TEXT,
  completion_threshold INTEGER,
  unique_outfit_count INTEGER,
  is_completed BOOLEAN,
  mount_status TEXT,
  mount_image_path TEXT,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.key,
    pc.display_name_ja,
    pc.display_name_en,
    pc.completion_threshold,
    COALESCE(cnt.unique_count, 0)::INTEGER,
    (cc.mount_status = 'completed') AS is_completed,
    cc.mount_status,
    cc.mount_image_path,
    cc.completed_at
  FROM public.preset_categories pc
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT ij.generation_metadata -> 'oneTapStyle' ->> 'id') AS unique_count
    FROM public.image_jobs ij
    WHERE ij.user_id = p_user_id
      AND ij.style_preset_category_key = pc.key
      AND ij.status = 'succeeded'
      AND ij.generation_metadata -> 'oneTapStyle' ->> 'id' IS NOT NULL
  ) cnt ON true
  LEFT JOIN public.collection_completions cc
    ON cc.category_id = pc.id AND cc.user_id = p_user_id
  WHERE pc.is_collection_series = true
    AND pc.is_active = true
    AND (
      p_include_admin_only = true
      OR (
        pc.visibility = 'public'
        AND (pc.collection_display_starts_at IS NULL OR now() >= pc.collection_display_starts_at)
        AND (pc.collection_display_ends_at IS NULL OR now() < pc.collection_display_ends_at)
      )
    )
  ORDER BY pc.display_order, pc.key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.get_collection_progress_for_user(UUID, BOOLEAN) IS
  'service_role route 専用。p_include_admin_only=true で admin_only シリーズ・表示期間外も含めて進捗を返す(admin プレビュー用)';

-- ===============================================
-- DOWN:
-- (RPC は 20260608100000 の定義に戻す)
-- ALTER TABLE public.preset_categories
--   DROP CONSTRAINT IF EXISTS preset_categories_collection_display_period_check;
-- ALTER TABLE public.preset_categories
--   DROP COLUMN IF EXISTS collection_display_starts_at,
--   DROP COLUMN IF EXISTS collection_display_ends_at;
-- ===============================================
