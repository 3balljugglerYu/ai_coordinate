export const STYLE_SIGNUP_SOURCE = "style" as const;
export const WARDROBE_SIGNUP_SOURCE = "wardrobe" as const;

export type SignupSource =
  | typeof STYLE_SIGNUP_SOURCE
  | typeof WARDROBE_SIGNUP_SOURCE;

const SIGNUP_SOURCES: readonly SignupSource[] = [
  STYLE_SIGNUP_SOURCE,
  WARDROBE_SIGNUP_SOURCE,
];

export function parseSignupSource(
  value: string | null | undefined
): SignupSource | null {
  return SIGNUP_SOURCES.find((source) => source === value) ?? null;
}

export function buildStyleSignupPath(nextPath = "/style"): string {
  return `/signup?${new URLSearchParams({
    next: nextPath,
    signup_source: STYLE_SIGNUP_SOURCE,
  }).toString()}`;
}
