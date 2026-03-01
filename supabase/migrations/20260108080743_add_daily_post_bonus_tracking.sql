-- profilesテーブルにデイリー投稿特典の最終受取日時を記録するカラムを追加
ALTER TABLE public.profiles
ADD COLUMN last_daily_post_bonus_at TIMESTAMPTZ NULL;

-- コメントを追加（オプション）
COMMENT ON COLUMN public.profiles.last_daily_post_bonus_at IS 
  'デイリー投稿特典の最終受取日時（JST基準）。NULLの場合は未受取。';

