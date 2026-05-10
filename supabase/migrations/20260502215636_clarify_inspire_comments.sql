COMMENT ON FUNCTION public.enforce_user_style_template_submission_cap()
  IS 'BEFORE INSERT/UPDATE OF moderation_status トリガ。pending 件数 (pending+visible) が 5 件以上で check_violation を投げる。SECURITY DEFINER の理由: count 対象に他ユーザーの行は含まれない（WHERE submitted_by_user_id でフィルタ）が、RLS が有効なテーブル上で count するため意図しないポリシー干渉を避ける目的で SECURITY DEFINER を維持している。';

COMMENT ON COLUMN public.user_style_templates.image_url
  IS 'テンプレート画像の Storage 内パス文字列（style-templates バケット内、例: "userId/uuid.png"）。実体取得は API 経由で createSignedUrl を発行する。命名は歴史的経緯。将来的に storage_path に一本化する可能性あり（重複情報）。';
