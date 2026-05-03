-- ===============================================
-- レビュー指摘 #4, #9 への対応: コメントの整理
-- ===============================================
-- #4: enforce_user_style_template_submission_cap の SECURITY DEFINER の理由を明記。
-- #9: user_style_templates.image_url の COMMENT が「署名 URL 経由でアクセス」となって
--     いるが、実装は Storage 内パス文字列を保存している。命名と内容の不一致を解消する
--     ため、COMMENT を実装に合わせて更新する（カラム自体はそのまま運用、将来の片寄せは
--     別 PR で計画）。

-- #4: トリガ関数のコメント
COMMENT ON FUNCTION public.enforce_user_style_template_submission_cap()
  IS 'BEFORE INSERT/UPDATE OF moderation_status トリガ。pending 件数 (pending+visible) が 5 件以上で check_violation を投げる。SECURITY DEFINER の理由: count 対象に他ユーザーの行は含まれない（WHERE submitted_by_user_id でフィルタ）が、RLS が有効なテーブル上で count するため意図しないポリシー干渉を避ける目的で SECURITY DEFINER を維持している。';

-- #9: image_url 列のコメント
COMMENT ON COLUMN public.user_style_templates.image_url
  IS 'テンプレート画像の Storage 内パス文字列（style-templates バケット内、例: "userId/uuid.png"）。実体取得は API 経由で createSignedUrl を発行する。命名は歴史的経緯。将来的に storage_path に一本化する可能性あり（重複情報）。';

-- ===============================================
-- DOWN:
-- COMMENT ON FUNCTION public.enforce_user_style_template_submission_cap() IS NULL;
-- COMMENT ON COLUMN public.user_style_templates.image_url IS '申請されたテンプレート画像 URL（private バケット、署名 URL 経由でアクセス）';
-- ===============================================
