-- コーディネート生成完了トーストの「最後に通知済み」時刻（端末をまたいだ重複表示防止）
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_coordinate_toast_ack_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_coordinate_toast_ack_at IS
  'coordinate 生成画像の完了トーストを最後に出した基準時刻（created_at より新しいものだけ再通知）';
