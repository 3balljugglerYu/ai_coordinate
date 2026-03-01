-- profilesテーブルにストリーク（連続ログイン）特典の追跡用カラムを追加
ALTER TABLE public.profiles
ADD COLUMN last_streak_login_at TIMESTAMPTZ NULL,
ADD COLUMN streak_days INTEGER NULL;

-- コメントを追加
COMMENT ON COLUMN public.profiles.last_streak_login_at IS 
  'ストリーク特典の最終ログイン日時（JST基準）。NULLの場合は未ログイン。';
COMMENT ON COLUMN public.profiles.streak_days IS 
  '連続ログイン日数（1-14の範囲、14日目で1に戻る）。NULLの場合は未開始。';

