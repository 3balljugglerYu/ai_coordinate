export const STYLE_SIGNUP_SOURCE = "style" as const;

export type SignupSource = typeof STYLE_SIGNUP_SOURCE;

export function parseSignupSource(value: string | null | undefined): SignupSource | null {
  if (value === STYLE_SIGNUP_SOURCE) {
    return STYLE_SIGNUP_SOURCE;
  }

  return null;
}

export function buildStyleSignupPath(nextPath = "/style"): string {
  return `/signup?${new URLSearchParams({
    next: nextPath,
    signup_source: STYLE_SIGNUP_SOURCE,
  }).toString()}`;
}
