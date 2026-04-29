-- Add coordinate stocks tab unread badge support
-- /coordinate のストックタブに付与する未確認バッジ判定用カラム。
-- profile.coordinate_stocks_tab_seen_at と MAX(source_image_stocks.created_at) の比較で
-- 「未確認のストックがあるか」を算出する（announcements_tab_seen_at と同じパターン）。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coordinate_stocks_tab_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.coordinate_stocks_tab_seen_at IS
  '/coordinate のストックタブを最後に開いた日時。MAX(source_image_stocks.created_at) と比較してドット表示の有無を決める。';

-- ロールバック手順:
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS coordinate_stocks_tab_seen_at;
