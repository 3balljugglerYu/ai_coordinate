-- preset_categories に「提供者(クリエイター)クレジット」用のカラムを追加する。
--
-- 目的:
--   コラボ/提供スタイル(例: 神コレ衣装)を、提供者本人のクレジット付きで公開できるようにする。
--   設定時、/style とホームのスタイルカードに「提供 <nickname>」を表示し、
--   選択画像のオーバーレイから /users/[provider_user_id] の本人プロフィールへ遷移できる。
--
-- 設計:
--   - provider_user_id は profiles(id) を参照する。これにより PostgREST の embedded select で
--     提供者の nickname / avatar_url をライブ取得でき、本人がプロフィールを更新すれば自動追従する。
--   - NULL のときは従来どおりクレジット非表示(既存カテゴリの挙動は一切変わらない)。
--   - プロフィール削除時はクレジットを外すだけにしたいので ON DELETE SET NULL。

ALTER TABLE public.preset_categories
  ADD COLUMN IF NOT EXISTS provider_user_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'preset_categories_provider_user_id_fkey'
  ) THEN
    ALTER TABLE public.preset_categories
      ADD CONSTRAINT preset_categories_provider_user_id_fkey
      FOREIGN KEY (provider_user_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.preset_categories.provider_user_id IS
  '提供者(クリエイター)の profiles.id。設定時 /style とホームのスタイルカードにクレジット表示し /users/[id] へリンクする。NULL なら従来どおりクレジットなし。';
