/**
 * GA4 にログイン状態とユーザー ID を設定する(管理ダッシュボード P3-4)。
 *
 * ここで守ること:
 *  - ログインしている人は、logged_in = yes と user_id = Supabase のユーザー ID を設定する
 *  - 未ログイン・ログアウトしたら、logged_in = no と user_id = null に戻す(前の人の ID を残さない)
 *  - 確認の途中(loading)では何も設定しない(確認の失敗を「未ログイン」として ID を消さない)
 *  - 送るのはユーザー ID だけ(メールアドレスは送らない)
 *  - gtag.js の読み込み前なら、設定を捨てずに dataLayer に並べる
 *  - GA4 の測定 ID が無い環境では、ログイン状態の確認もしない
 */

import { render } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { Ga4LoginStatus } from "@/features/analytics/components/Ga4LoginStatus";
import { useAuthUser, type AuthUserState } from "@/features/auth/hooks/use-auth-user";

jest.mock("@/features/auth/hooks/use-auth-user", () => ({ useAuthUser: jest.fn() }));
jest.mock("@/lib/public-env", () => ({
  publicEnv: { NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-TEST" },
}));

const useAuthUserMock = useAuthUser as jest.MockedFunction<typeof useAuthUser>;
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "someone@example.com" } as User;

const SIGNED_IN: AuthUserState = { status: "signed-in", user: USER };
const SIGNED_OUT: AuthUserState = { status: "signed-out", user: null };
const LOADING: AuthUserState = { status: "loading", user: null };

beforeEach(() => {
  window.gtag = jest.fn();
  delete window.dataLayer;
});

afterEach(() => {
  delete window.gtag;
  delete window.dataLayer;
  jest.clearAllMocks();
});

describe("Ga4LoginStatus", () => {
  it("ログインしている人は、logged_in = yes とユーザー ID を設定する(メールアドレスは送らない)", () => {
    useAuthUserMock.mockReturnValue(SIGNED_IN);

    render(<Ga4LoginStatus />);

    expect(window.gtag).toHaveBeenCalledWith("set", "user_properties", { logged_in: "yes" });
    expect(window.gtag).toHaveBeenCalledWith("set", { user_id: USER.id });
    expect(JSON.stringify((window.gtag as jest.Mock).mock.calls)).not.toContain("someone@example.com");
  });

  it("未ログインなら、logged_in = no と user_id = null を設定する", () => {
    useAuthUserMock.mockReturnValue(SIGNED_OUT);

    render(<Ga4LoginStatus />);

    expect(window.gtag).toHaveBeenCalledWith("set", "user_properties", { logged_in: "no" });
    expect(window.gtag).toHaveBeenCalledWith("set", { user_id: null });
  });

  it("確認の途中(確認に失敗して取り直している間も含む)は何も設定しない", () => {
    useAuthUserMock.mockReturnValue(LOADING);

    render(<Ga4LoginStatus />);

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("ログアウトしたら user_id を null に戻し、前の人の ID は設定し直さない", () => {
    useAuthUserMock.mockReturnValue(SIGNED_IN);
    const { rerender } = render(<Ga4LoginStatus />);
    (window.gtag as jest.Mock).mockClear();

    useAuthUserMock.mockReturnValue(SIGNED_OUT);
    rerender(<Ga4LoginStatus />);

    expect(window.gtag).toHaveBeenCalledWith("set", { user_id: null });
    expect(window.gtag).not.toHaveBeenCalledWith("set", { user_id: USER.id });
  });

  it("gtag.js の読み込み前なら、設定を dataLayer に並べる(捨てない)", () => {
    delete window.gtag;
    useAuthUserMock.mockReturnValue(SIGNED_IN);

    render(<Ga4LoginStatus />);

    const queued = (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(queued).toEqual([
      ["set", "user_properties", { logged_in: "yes" }],
      ["set", { user_id: USER.id }],
    ]);
  });
});

describe("Ga4LoginStatus(測定 ID が無い環境)", () => {
  const env = jest.requireMock("@/lib/public-env").publicEnv as { NEXT_PUBLIC_GA4_MEASUREMENT_ID?: string };

  afterEach(() => {
    env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = "G-TEST";
  });

  it("ログイン状態の確認もしない", () => {
    env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = undefined;
    useAuthUserMock.mockReturnValue(SIGNED_IN);

    render(<Ga4LoginStatus />);

    expect(useAuthUserMock).not.toHaveBeenCalled();
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
