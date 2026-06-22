-- style_presets に「プリセット単位の提供者(クリエイター)クレジット」用のカラムを追加する。
--
-- 目的:
--   1 カテゴリ(例 character_remix)に複数ユーザーのプロンプトが混在する場合に、
--   プロンプトごとに正しい提供者クレジットを表示できるようにする。
--   表示はプリセット単位を優先し、未設定ならカテゴリ単位(preset_categories.provider_user_id)に
--   フォールバックする。
--
-- 設計(#357 のカテゴリ単位と同じ方針):
--   - provider_user_id は profiles(id) を参照する。これにより PostgREST の embedded select で
--     提供者の nickname / avatar_url をライブ取得でき、本人がプロフィールを更新すれば自動追従する。
--     埋め込みエイリアスに合わせ FK 制約名は style_presets_provider_user_id_fkey とする。
--   - NULL のときはカテゴリ単位にフォールバック(既存プリセットの挙動は変わらない)。
--   - プロフィール削除時はクレジットを外すだけにしたいので ON DELETE SET NULL。
--
-- 注意:
--   各プリセットへの提供者割当(例: nanoblock = mario)はランタイムデータのため、
--   本スキーママイグレーションには含めず、運用(admin / DB 操作)で設定する。

ALTER TABLE public.style_presets
  ADD COLUMN IF NOT EXISTS provider_user_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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

COMMENT ON COLUMN public.style_presets.provider_user_id IS
  'プリセット単位の提供者(クリエイター)の profiles.id。設定時 /style とホームのスタイルカードにクレジット表示し /users/[id] へリンクする。NULL ならカテゴリ単位(preset_categories.provider_user_id)にフォールバック。';
