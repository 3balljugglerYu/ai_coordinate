-- book(めくれる日記帳)モードのコレクションは台紙テンプレ/レイアウトを使わないため、
-- collection settings completeness の CHECK を book モードで免除する。
-- アプリ層の R-02 免除(app/api/admin/preset-categories/collection-settings-payload.ts)に
-- 対応する DB 側の整合。これが無いと book カテゴリを is_collection_series=true に
-- できない(直DB更新・admin フォームのどちらでも CHECK 違反になる)。
--
-- mount(従来台紙)モードは従来どおり mount_template_path + (mount_layout or mount_slots) を要求。
-- book モードは completion_threshold(=ページ数 N)のみ必須。追加列なし・制約の緩和のみ・後方互換。
BEGIN;

ALTER TABLE public.preset_categories
  DROP CONSTRAINT IF EXISTS preset_categories_collection_settings_complete;
ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_collection_settings_complete
  CHECK (
    is_collection_series = false
    OR (completion_view_mode = 'book' AND completion_threshold IS NOT NULL)
    OR (
      completion_threshold IS NOT NULL
      AND mount_template_path IS NOT NULL
      AND (mount_layout IS NOT NULL OR mount_slots IS NOT NULL)
    )
  );

COMMIT;
