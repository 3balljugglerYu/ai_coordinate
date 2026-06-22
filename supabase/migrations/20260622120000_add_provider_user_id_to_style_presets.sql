-- style_presets にプリセット単位の提供者(provider_user_id)を追加。
-- カテゴリ単位(preset_categories.provider_user_id)とは独立して設定でき、
-- 1 カテゴリに複数提供者が混在する character_remix 等で、
-- 各プロンプトごとに正しい提供者クレジット(アイコン+ニックネーム)を表示できるようにする。
-- 表示はプリセット単位を優先し、未設定ならカテゴリ単位にフォールバックする。

ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS provider_user_id uuid;

-- PostgREST の embedded select(provider:profiles!style_presets_provider_user_id_fkey)で
-- JOIN できるよう、profiles への FK を貼る。制約名は埋め込みエイリアスに合わせる。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'style_presets_provider_user_id_fkey'
  ) THEN
    ALTER TABLE public.style_presets
      ADD CONSTRAINT style_presets_provider_user_id_fkey
      FOREIGN KEY (provider_user_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_style_presets_provider_user_id
  ON public.style_presets (provider_user_id);

-- nanoblock(character_remix)を mario さんのクレジットに設定。
UPDATE public.style_presets
  SET provider_user_id = 'cb9a1064-06e3-4379-9d99-957ca09fbee1'
  WHERE id = 'd8765ea4-73ea-4090-86d2-e5bef1b7ed44';
