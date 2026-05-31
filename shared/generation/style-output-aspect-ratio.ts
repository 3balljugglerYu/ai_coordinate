export const STYLE_OUTPUT_ASPECT_RATIO_MODES = ["source", "square"] as const;

export type StyleOutputAspectRatioMode =
  (typeof STYLE_OUTPUT_ASPECT_RATIO_MODES)[number];

export function isStyleOutputAspectRatioMode(
  value: unknown,
): value is StyleOutputAspectRatioMode {
  return value === "source" || value === "square";
}

export function normalizeStyleOutputAspectRatioMode(
  value: unknown,
): StyleOutputAspectRatioMode {
  return isStyleOutputAspectRatioMode(value) ? value : "source";
}

export function shouldForceSquareStyleOutput(
  mode: unknown,
): boolean {
  return normalizeStyleOutputAspectRatioMode(mode) === "square";
}
