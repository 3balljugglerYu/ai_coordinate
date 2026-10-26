/** @jest-environment node */

/**
 * 管理画面のページの先頭で呼ぶ確認(ensureAdminPage)。
 * 管理者でなければ / へ戻す。レイアウトだけに任せると、ページのデータが先に流れ出る。
 */

jest.mock("server-only", () => ({}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({ getAdminUserIds: jest.fn() }));

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { ensureAdminPage } from "@/lib/admin-page-guard";

const mockRedirect = redirect as unknown as jest.Mock;
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAdminIds = getAdminUserIds as jest.MockedFunction<typeof getAdminUserIds>;

const ADMIN = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminIds.mockReturnValue([ADMIN]);
});

test("管理者なら戻さず、ユーザーを返す", async () => {
  mockGetUser.mockResolvedValue({ id: ADMIN } as never);
  await expect(ensureAdminPage()).resolves.toEqual({ id: ADMIN });
  expect(mockRedirect).not.toHaveBeenCalled();
});

test.each([
  ["ログインしていない", null, [ADMIN]],
  ["管理者でない", { id: USER }, [ADMIN]],
  ["管理者の一覧が空", { id: ADMIN }, []],
])("%s なら / へ戻す", async (_label, user, ids) => {
  mockGetUser.mockResolvedValue(user as never);
  mockAdminIds.mockReturnValue(ids as string[]);
  await expect(ensureAdminPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(mockRedirect).toHaveBeenCalledWith("/");
});
