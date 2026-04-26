/**
 * Client-side navigation guard for pages that still require sign-in.
 *
 * `/coordinate` intentionally stays public for guest generation trials.
 * The server route still protects account-only APIs and saved gallery data.
 */
export function requiresAuthForGuestNavigation(normalizedPathname: string) {
  return (
    normalizedPathname === "/challenge" ||
    normalizedPathname === "/notifications" ||
    normalizedPathname.startsWith("/my-page")
  );
}
