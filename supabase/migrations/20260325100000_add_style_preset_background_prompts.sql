-- One-Tap Style プリセットに styling/background prompt を追加する

ALTER TABLE public.style_presets
  ADD COLUMN styling_prompt TEXT,
  ADD COLUMN background_prompt TEXT;

UPDATE public.style_presets
SET styling_prompt = prompt
WHERE styling_prompt IS NULL;

ALTER TABLE public.style_presets
  ALTER COLUMN styling_prompt SET NOT NULL;

COMMENT ON COLUMN public.style_presets.prompt IS
  'legacy styling prompt. retained temporarily for additive migration compatibility';

COMMENT ON COLUMN public.style_presets.styling_prompt IS
  'One-Tap Style styling prompt used for outfit generation';

COMMENT ON COLUMN public.style_presets.background_prompt IS
  'Optional One-Tap Style background prompt used when background change is enabled';
