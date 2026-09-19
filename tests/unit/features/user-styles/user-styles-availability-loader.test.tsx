/** @jest-environment node */

/**
 * 段階公開中に「運営だけトグルを出す」判定。
 *
 * ⭐ `ADMIN_USER_IDS` はサーバー専用なので、クライアントでは判定できない。
 * ここが緩むと**一般ユーザーの `/styles` にもトグルが出て**、公開前の機能の
 * 存在が知られる。逆に厳しすぎると運営が動きを確認できない。
 *
 * ⭐ 認証往復のコストにも気を配る。このローダーは全ページで走るので、
 * 未ログイン（＝大半の閲覧者）には `getUser()` を呼ばずに帰ること。
 */

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isUserStylesAvailable: jest.fn(),
  isUserStylesPubliclyEnabled: jest.fn(),
}));

import { UserStylesAvailabilityLoader } from "@/features/user-styles/components/UserStylesAvailabilityLoader";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable, isUserStylesPubliclyEnabled } from "@/lib/env";

const mockCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAvailable = isUserStylesAvailable as jest.MockedFunction<
  typeof isUserStylesAvailable
>;
const mockPublic = isUserStylesPubliclyEnabled as jest.MockedFunction<
  typeof isUserStylesPubliclyEnabled
>;

function withCookies(names: string[]) {
  mockCookies.mockResolvedValue({
    getAll: () => names.map((name) => ({ name, value: "x" })),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPublic.mockReturnValue(false);
  mockAvailable.mockReturnValue(false);
  withCookies([]);
  mockGetUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getUser>>);
});

describe("UserStylesAvailabilityLoader", () => {
  /*
    ⭐ 一般公開後はクライアント側の初期値で確定している。
    ここで認証を引くと、全ページに無駄な認証往復が増えるだけ。
  */
  test("一般公開後は認証を引かずに帰る", async () => {
    mockPublic.mockReturnValue(true);

    await expect(UserStylesAvailabilityLoader()).resolves.toBeNull();
    expect(mockCookies).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  /*
    ⭐ 未ログインは運営ではありえない。cookie を見るだけで済ませ、
    大半の閲覧者に認証往復を発生させない。
  */
  test("認証cookieが無ければ getUser を呼ばずに帰る", async () => {
    withCookies(["some-other-cookie"]);

    await expect(UserStylesAvailabilityLoader()).resolves.toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("ログインしていても運営でなければ昇格させない", async () => {
    withCookies(["sb-access-token"]);
    mockGetUser.mockResolvedValue({ id: "normal-user" } as unknown as Awaited<
      ReturnType<typeof getUser>
    >);
    mockAvailable.mockReturnValue(false);

    await expect(UserStylesAvailabilityLoader()).resolves.toBeNull();
    expect(mockAvailable).toHaveBeenCalledWith("normal-user");
  });

  test("運営なら昇格させる", async () => {
    withCookies(["sb-access-token"]);
    mockGetUser.mockResolvedValue({ id: "admin-1" } as unknown as Awaited<
      ReturnType<typeof getUser>
    >);
    mockAvailable.mockReturnValue(true);

    const result = await UserStylesAvailabilityLoader();

    expect(result).not.toBeNull();
    expect(mockAvailable).toHaveBeenCalledWith("admin-1");
  });
});
