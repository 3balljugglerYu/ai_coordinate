/** @jest-environment node */

/**
 * /user-styles の段階公開ゲート。
 *
 * ⭐ ここが緩むと、URL を知っているだけで公開前の一覧が開ける。
 * ⭐ 逆に「公開後も認証を引く」形にすると、ページ全体がリクエスト依存になり
 *    静的シェルの前提が崩れる。両方を検査する。
 */

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  isUserStylesAvailable: jest.fn(),
  isUserStylesPubliclyEnabled: jest.fn(),
}));
jest.mock("@/features/user-styles/lib/get-user-style-page", () => ({
  getUserStylePage: jest.fn().mockResolvedValue({ posts: [], nextCursor: null }),
}));
// "use cache" は next/cache のリクエスト文脈を要求するので差し替える。
jest.mock("@/features/user-styles/lib/get-public-user-style-page", () => ({
  getPublicUserStyleFirstPage: jest
    .fn()
    .mockResolvedValue({ posts: [], nextCursor: null }),
}));
/*
  クライアントコンポーネントは next-intl(ESM)を引くので、node 環境では素通しできない。
  ここで見たいのはゲートだけなので、描画は差し替える。
*/
jest.mock("@/features/style-presets/components/OriginalKindTabs", () => ({
  OriginalKindTabs: () => null,
}));
jest.mock("@/features/user-styles/components/UserStylesFeedClient", () => ({
  UserStylesFeedClient: () => null,
}));
jest.mock("@/features/user-styles/components/UserStylesFeedSkeleton", () => ({
  UserStylesFeedSkeleton: () => null,
}));

import UserStylesPage from "@/app/user-styles/page";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable, isUserStylesPubliclyEnabled } from "@/lib/env";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAvailable = isUserStylesAvailable as jest.MockedFunction<
  typeof isUserStylesAvailable
>;
const mockPublic = isUserStylesPubliclyEnabled as jest.MockedFunction<
  typeof isUserStylesPubliclyEnabled
>;

const params = () => Promise.resolve({ locale: "ja" });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getUser>>);
});

describe("/user-styles の段階公開ゲート", () => {
  test("公開前に権限が無ければ 404", async () => {
    mockPublic.mockReturnValue(false);
    mockAvailable.mockReturnValue(false);

    await expect(UserStylesPage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  test("公開前でも運営なら開ける", async () => {
    mockPublic.mockReturnValue(false);
    mockAvailable.mockReturnValue(true);
    mockGetUser.mockResolvedValue({ id: "admin-1" } as unknown as Awaited<
      ReturnType<typeof getUser>
    >);

    await expect(UserStylesPage({ params: params() })).resolves.toBeTruthy();
    expect(mockAvailable).toHaveBeenCalledWith("admin-1");
  });

  /*
    ⭐ 公開後に `getUser()` を呼ぶと、ページ全体がリクエスト依存になって
    静的シェル（初期 HTML に見出しと JSON-LD を載せる前提）が崩れる。
    認可のルールは1本のまま、認証を引く場面だけを公開前に限っている。
  */
  test("公開後はゲートのために認証を引かない", async () => {
    mockPublic.mockReturnValue(true);

    await expect(UserStylesPage({ params: params() })).resolves.toBeTruthy();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockAvailable).not.toHaveBeenCalled();
  });
});
