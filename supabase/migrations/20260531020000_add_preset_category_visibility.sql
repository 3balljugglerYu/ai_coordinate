-- preset_categories に公開範囲を追加する。
-- 新規カテゴリは安全側で admin_only を default とし、運営確認後に管理画面から public へ切り替える。

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'admin_only'
    CHECK (visibility IN ('public', 'admin_only'));

-- 既存の通常カテゴリは一般公開を維持し、chibi は運営確認用に閉じる。
UPDATE public.preset_categories
SET visibility = 'public'
WHERE key = 'coordinate';

UPDATE public.preset_categories
SET visibility = 'admin_only'
WHERE key = 'chibi';

COMMENT ON COLUMN public.preset_categories.visibility IS
  'public = 全ユーザーに公開 / admin_only = ADMIN_USER_IDS の運営ユーザーだけ表示・生成可能';

-- Direct Supabase reads must follow the same public/admin-only boundary as the
-- Next.js app. Admin screens use service-role routes, so they still see all rows.
DROP POLICY IF EXISTS "preset_categories_public_read" ON public.preset_categories;
CREATE POLICY "preset_categories_public_read"
  ON public.preset_categories
  FOR SELECT
  USING (visibility = 'public');

DROP POLICY IF EXISTS "style_presets_select_published" ON public.style_presets;
CREATE POLICY "style_presets_select_published"
  ON public.style_presets
  FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.preset_categories pc
      WHERE pc.id = style_presets.category_id
        AND pc.visibility = 'public'
    )
  );
