/** @jest-environment jsdom */

import { createClient } from "@/lib/supabase/client";
import { getSiteUrlForClient } from "@/lib/public-env";
import { signUp } from "@/features/auth/lib/auth-client";

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/public-env", () => ({
  getSiteUrlForClient: jest.fn(),
}));

describe("auth-client signUp redirect", () => {
  const supabaseSignUpMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.MockedFunction<typeof createClient>).mockReturnValue({
      auth: {
        signUp: supabaseSignUpMock,
      },
    } as unknown as ReturnType<typeof createClient>);
    (getSiteUrlForClient as jest.MockedFunction<typeof getSiteUrlForClient>)
      .mockReturnValue("https://example.com");
    supabaseSignUpMock.mockResolvedValue({ data: {}, error: null });
  });

  test("redirectTo指定時_emailRedirectToのcallbackにnextを含める", async () => {
    await signUp(
      "user@example.com",
      "Aa1!aaaa",
      undefined,
      null,
      "/style?claim_wardrobe=1",
    );

    expect(supabaseSignUpMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Aa1!aaaa",
      options: {
        emailRedirectTo:
          "https://example.com/auth/callback?next=%2Fstyle%3Fclaim_wardrobe%3D1",
      },
    });
  });

  test("redirectTo未指定時_emailRedirectToは従来通りcallbackのみ", async () => {
    await signUp("user@example.com", "Aa1!aaaa");

    expect(supabaseSignUpMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Aa1!aaaa",
      options: {
        emailRedirectTo: "https://example.com/auth/callback",
      },
    });
  });
});
