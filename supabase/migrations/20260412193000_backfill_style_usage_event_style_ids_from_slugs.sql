-- Backfill legacy One-Tap Style event references that still store preset slugs
-- instead of the canonical style_presets UUID.

UPDATE public.style_usage_events AS event
SET style_id = preset.id::text
FROM public.style_presets AS preset
WHERE event.style_id = preset.slug;
