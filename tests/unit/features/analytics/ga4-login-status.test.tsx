/**
 * GA4 にログイン状態とユーザー ID を設定する(管理ダッシュボード P3-4)。
 *
 * ここで守ること:
 *  - ログインしている人は、logged_in = yes と user_id = Supabase のユーザー ID を設定する
 *  - 未ログイン・ログアウトしたら、logged_in = no と user_id = null に戻す(前の人の ID を残さない)
 *  - 送るのはユーザー ID だけ(メールアドレスは送らない)
 *  - gtag が無い(読み込み前・広告ブロック)ときは何もしない
 */

import { act, render } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { Ga4LoginStatus } from "@/features/analytics/components/Ga4LoginStatus";
import { getCurrentUser, onAuthStateChange } from "@/features/auth/lib/auth-client";

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

const getCurrentUserMock = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const onAuthStateChangeMock = onAuthStateChange as jest.MockedFunction<typeof onAuthStateChange>;

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "someone@example.com" } as User;

let authListener: ((user: User | null) => void) | null = null;

beforeEach(() => {
  authListener = null;
  onAuthStateChangeMock.mockImplementation((callback) => {
    authListener = (user) => callback(user, "SIGNED_IN");
    return { unsubscribe: jest.fn() } as unknown as ReturnType<typeof onAuthStateChange>;
  });
  window.gtag = jest.fn();
});

afterEach(() => {
  delete window.gtag;
  jest.clearAllMocks();
});

async function renderAndSettle() {
  render(<Ga4LoginStatus />);
  await act(async () => {});
}

describe("Ga4LoginStatus", () => {
  it("ログインしている人は、logged_in = yes とユーザー ID を設定する(メールアドレスは送らない)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);

    await renderAndSettle();

    expect(window.gtag).toHaveBeenCalledWith("set", "user_properties", { logged_in: "yes" });
    expect(window.gtag).toHaveBeenCalledWith("set", { user_id: USER.id });
    expect(JSON.stringify((window.gtag as jest.Mock).mock.calls)).not.toContain("someone@example.com");
  });

  it("未ログインなら、logged_in = no と user_id = null を設定する", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await renderAndSettle();

    expect(window.gtag).toHaveBeenCalledWith("set", "user_properties", { logged_in: "no" });
    expect(window.gtag).toHaveBeenCalledWith("set", { user_id: null });
  });

  it("ログアウトしたら、user_id を null に戻す(前の人の ID を残さない)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    await renderAndSettle();
    (window.gtag as jest.Mock).mockClear();

    act(() => authListener?.(null));

    expect(window.gtag).toHaveBeenCalledWith("set", { user_id: null });
    expect(window.gtag).not.toHaveBeenCalledWith("set", { user_id: USER.id });
  });

  it("gtag が無いときは何もしない(落ちない)", async () => {
    delete window.gtag;
    getCurrentUserMock.mockResolvedValue(USER);

    await expect(renderAndSettle()).resolves.toBeUndefined();
  });
});
