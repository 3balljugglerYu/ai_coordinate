-- coordinate 完了トースト用: user_id + created_at 範囲（generation_type 固定）のポーリングを索引で支援
CREATE INDEX IF NOT EXISTS idx_generated_images_user_coord_created
  ON public.generated_images (user_id, created_at DESC)
  WHERE generation_type = 'coordinate';
