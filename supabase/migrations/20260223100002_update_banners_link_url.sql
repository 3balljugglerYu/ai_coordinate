-- バナーの link_url を /event/detail/01 から /free-materials に更新
UPDATE public.banners
SET link_url = '/free-materials'
WHERE link_url = '/event/detail/01';
