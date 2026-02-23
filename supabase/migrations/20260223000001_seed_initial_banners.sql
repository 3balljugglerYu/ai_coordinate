-- 既存2件のバナーをシード
-- 画像は public/banners/ の静的ファイルを参照

INSERT INTO public.banners (image_url, storage_path, link_url, alt, display_order, status)
VALUES
  ('/banners/event-01.png', NULL, '/free-materials', '着せ替えお試し用素材 イベントバナー', 0, 'published'),
  ('/banners/event-02.png', NULL, '/challenge', 'ミッション', 1, 'published');
