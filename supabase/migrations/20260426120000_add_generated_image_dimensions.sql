-- generated_images に width / height 列を追加する。
-- 目的: Post 詳細画面で実寸（例: 1024×1536）を表示するためのキャッシュ列。
-- 値は server-api の lazy compute（fetch 時に画像ヘッダーをパース）で順次埋まる。
-- 既存列（aspect_ratio / background_change）は本 PR では削除せず互換維持。

ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS width INT NULL
CHECK (width IS NULL OR width > 0);

ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS height INT NULL
CHECK (height IS NULL OR height > 0);
