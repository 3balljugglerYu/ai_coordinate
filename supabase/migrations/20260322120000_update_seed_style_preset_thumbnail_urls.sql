-- legacy public/style assets を削除したため、
-- seed された style_presets のサムネイル参照を Supabase Storage URL に更新する

UPDATE public.style_presets AS sp
SET
  thumbnail_image_url = seeded.thumbnail_image_url,
  thumbnail_storage_path = seeded.thumbnail_storage_path
FROM (
  VALUES
    (
      'a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e'::UUID,
      'https://hnrccaxrvhtbuihfvitc.supabase.co/storage/v1/object/public/style_presets/a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e/a2307e2b-d30c-494b-8f2b-4617dc93c030.webp',
      'a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e/a2307e2b-d30c-494b-8f2b-4617dc93c030.webp'
    ),
    (
      '43f1b7d4-0ffb-44b5-b8ff-1d1d7c8a2e50'::UUID,
      'https://hnrccaxrvhtbuihfvitc.supabase.co/storage/v1/object/public/style_presets/43f1b7d4-0ffb-44b5-b8ff-1d1d7c8a2e50/2d716d5d-7c62-49ba-bdad-bd3f49034ab3.webp',
      '43f1b7d4-0ffb-44b5-b8ff-1d1d7c8a2e50/2d716d5d-7c62-49ba-bdad-bd3f49034ab3.webp'
    ),
    (
      '8d7135ec-1b97-4dfe-b634-4a87f58f3dc8'::UUID,
      'https://hnrccaxrvhtbuihfvitc.supabase.co/storage/v1/object/public/style_presets/8d7135ec-1b97-4dfe-b634-4a87f58f3dc8/7dbfe2f1-dd35-4328-a8e4-69c62644cfeb.webp',
      '8d7135ec-1b97-4dfe-b634-4a87f58f3dc8/7dbfe2f1-dd35-4328-a8e4-69c62644cfeb.webp'
    ),
    (
      'c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1'::UUID,
      'https://hnrccaxrvhtbuihfvitc.supabase.co/storage/v1/object/public/style_presets/c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1/8ba7f5bb-87f3-4f49-b9d1-a183f0684441.webp',
      'c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1/8ba7f5bb-87f3-4f49-b9d1-a183f0684441.webp'
    ),
    (
      'd1867d7b-fb0c-43bb-94c8-7a45cdfec5b7'::UUID,
      'https://hnrccaxrvhtbuihfvitc.supabase.co/storage/v1/object/public/style_presets/d1867d7b-fb0c-43bb-94c8-7a45cdfec5b7/aee092bd-59b3-45a6-9eee-a46012cce61d.webp',
      'd1867d7b-fb0c-43bb-94c8-7a45cdfec5b7/aee092bd-59b3-45a6-9eee-a46012cce61d.webp'
    )
) AS seeded(id, thumbnail_image_url, thumbnail_storage_path)
WHERE sp.id = seeded.id;
