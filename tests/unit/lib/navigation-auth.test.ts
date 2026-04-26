import { requiresAuthForGuestNavigation } from "@/lib/navigation-auth";

describe("requiresAuthForGuestNavigation", () => {
  test.each(["/", "/style", "/coordinate"])(
    "%s はゲストでもクライアント遷移できる",
    (pathname) => {
      expect(requiresAuthForGuestNavigation(pathname)).toBe(false);
    }
  );

  test.each(["/challenge", "/notifications", "/my-page", "/my-page/credits"])(
    "%s はゲストのクライアント遷移でログインが必要",
    (pathname) => {
      expect(requiresAuthForGuestNavigation(pathname)).toBe(true);
    }
  );
});
