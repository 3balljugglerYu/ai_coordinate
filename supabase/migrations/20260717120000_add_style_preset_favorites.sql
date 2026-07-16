-- /style の「お気に入り」登録テーブル。
--
-- ユーザーが One-Tap Style プリセットに♡を付け、シートの「♡お気に入り」チップで
-- 絞り込むための最小テーブル。likes(投稿いいね)と違い他人へ公開する必要が無いため、
-- RLS は SELECT も含めて本人行のみに絞る。
CREATE TABLE public.style_preset_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preset_id UUID NOT NULL REFERENCES public.style_presets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preset_id)
);

-- プリセット削除時のFKカスケードと、将来の「お気に入り数」集計用。
CREATE INDEX idx_style_preset_favorites_preset_id
  ON public.style_preset_favorites (preset_id);

ALTER TABLE public.style_preset_favorites ENABLE ROW LEVEL SECURITY;

-- 本人のみ参照(公開読み取りは提供しない)。
CREATE POLICY "Users can view their own style preset favorites"
  ON public.style_preset_favorites
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- 本人としてのみ追加。
CREATE POLICY "Users can insert their own style preset favorites"
  ON public.style_preset_favorites
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 本人行のみ削除。
CREATE POLICY "Users can delete their own style preset favorites"
  ON public.style_preset_favorites
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.style_preset_favorites IS
  '/style のお気に入り(♡)。user_id×preset_id。RLSは本人行のみ(公開読み取りなし)';
