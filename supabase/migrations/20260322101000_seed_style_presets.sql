-- 既存の One-Tap Style プリセットを style_presets に初期投入する

INSERT INTO public.style_presets (
  id,
  slug,
  title,
  prompt,
  thumbnail_image_url,
  thumbnail_storage_path,
  thumbnail_width,
  thumbnail_height,
  sort_order,
  status,
  created_by,
  updated_by
)
VALUES
  (
    'a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e',
    'fluffy_pajamas_code',
    'FLUFFY PAJAMAS CODE',
    $prompt$Wearing Cozy Sherpa loungewear style outfit.
no hat, bare head, empty hands, not holding anything.
Main colors: #212529 dark grey, #D1EAF1 light blue, #CED4DA light grey.
A loose-fitting, hooded, zip-up sherpa fleece jacket, with bold, variegated horizontal stripes. Matching striped sherpa fleece short pants. No accessories. Bare legs, barefoot, matching the relaxed pose. Intense, plush, fuzzy sherpa texture with high softness. Thick striping pattern with the specified colors.$prompt$,
    '/style/fluffy_pajamas_code/fluffy_pajamas_code.webp',
    NULL,
    912,
    1173,
    0,
    'published',
    NULL,
    NULL
  ),
  (
    '43f1b7d4-0ffb-44b5-b8ff-1d1d7c8a2e50',
    'gothic_witch',
    'GOTHIC WITCH',
    $prompt$Wearing Victorian Gothic style outfit.
Dark blue (#1A1D45) pointed witch's hat with a prominent deep red (#8B0000) ribbon bow, Holds an ornate leather-bound grimoire with gold embossing (#D4AF37) in her left hand.
Dark blue (#1A1D45), deep red (#8B0000), gold (#D4AF37), crimson (#FF4500) magic energy, Dark blue (#1A1D45) high-necked bodice with deep red (#8B0000) trim on the collar and cuffs, and a red gem-set pin at the throat, A voluminous dark blue (#1A1D45) full-length gown with a tiered skirt, trimmed with deep red (#8B0000) fabric, A complex multi-tiered gold chain (#D4AF37) belt at the waist, adorned with numerous dangling deep red (#8B0000) teardrop-shaped gems, Dark leather ankle boots, Velvety and heavy fabrics, intricate metallic chain, polished gems, aged leather book, Swirling currents of crimson (#FF4500) magic energy emanate from the book and coil around her.$prompt$,
    '/style/gothic_witch/gothic_witch.webp',
    NULL,
    1344,
    1792,
    1,
    'published',
    NULL,
    NULL
  ),
  (
    '8d7135ec-1b97-4dfe-b634-4a87f58f3dc8',
    'kimono',
    'KIMONO',
    $prompt$Wearing Traditional Japanese Kimono style outfit.
Elaborate gold kanzashi hair ornament with red accents, bare head. Holding a wooden folding fan in hands.
Red, white, gold, and pink colors. Multi-layered junihitoe robe. Dominant red outer layer with gold cherry blossom and maple leaf patterns. Underlayers in white, pink, and peach. Red hakama. Colorful braided cords.$prompt$,
    '/style/kimono/kimono.webp',
    NULL,
    864,
    1184,
    2,
    'published',
    NULL,
    NULL
  ),
  (
    'c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1',
    'paris_code',
    'PARIS CODE',
    $prompt$Wearing Casual Classic with a Prep edge style outfit.
Tan/beige cap (#D2B48C), hands posed as in the image.
#FFFFFF white, #36454F charcoal gray, #ADD8E6 light blue, #D2B48C beige. White ruffled blouse with black ribbon tie, topped with a charcoal gray tweed cropped jacket with gold buttons. Light blue high-waist wide-leg jeans. Small beige canvas handbag with olive/brown pattern and dark strap, held in the left hand. Black loafers. Tweed texture, ruffles, denim texture, monogram pattern.$prompt$,
    '/style/paris_code/paris_code.webp',
    NULL,
    912,
    1173,
    3,
    'published',
    NULL,
    NULL
  ),
  (
    'd1867d7b-fb0c-43bb-94c8-7a45cdfec5b7',
    'spring_smart_casual',
    'SPRING SMART CASUAL',
    $prompt$Wearing Smart Casual style outfit.
no hat, bare head, left hand holding a handbag.
#000080 navy blue, #0000FF blue and #FFFFFF white, #FFFFFF white, #000000 black, #A52A2A brown, #FFD700 gold. Navy blue tailored blazer, blue and white vertical striped button-down shirt. White maxi-length flowing skirt. Brown leather handbag, gold watch, rings. Black pointed-toe loafers. Stripe pattern on shirt, smooth textures.$prompt$,
    '/style/spring_smart_casual/spring_smart_casual.webp',
    NULL,
    576,
    768,
    4,
    'published',
    NULL,
    NULL
  )
ON CONFLICT (id) DO NOTHING;
