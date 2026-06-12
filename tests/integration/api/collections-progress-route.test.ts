/** @jest-environment node */

const createClientMock = jest.fn();
const isAdminViewerMock = jest.fn();
const getCollectionProgressForUserMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

jest.mock("@/lib/env", () => ({
  isAdminViewer: (...args: unknown[]) => isAdminViewerMock(...args),
}));

jest.mock("@/features/collections/lib/collection-progress-repository", () => ({
  getCollectionProgressForUser: (...args: unknown[]) =>
    getCollectionProgressForUserMock(...args),
}));

import { GET } from "@/app/api/collections/progress/route";

function buildSupabase(user: { id: string } | null) {
  const getUser = jest.fn().mockResolvedValue({ data: { user }, error: null });
  return { auth: { getUser } };
}

describe("GET /api/collections/progress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("未ログインの場合_items空配列を返す", async () => {
    createClientMock.mockResolvedValue(buildSupabase(null));

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(getCollectionProgressForUserMock).not.toHaveBeenCalled();
  });

  test("admin の場合_isAdminViewer:true と進捗を返す", async () => {
    createClientMock.mockResolvedValue(buildSupabase({ id: "admin-1" }));
    isAdminViewerMock.mockReturnValue(true);
    getCollectionProgressForUserMock.mockResolvedValue([{ categoryKey: "k" }]);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.isAdminViewer).toBe(true);
    expect(body.items).toEqual([{ categoryKey: "k" }]);
    // admin フラグが repository に渡る(admin_only シリーズも含める)
    expect(getCollectionProgressForUserMock).toHaveBeenCalledWith("admin-1", true);
  });

  test("非 admin の場合_isAdminViewer:false を返す", async () => {
    createClientMock.mockResolvedValue(buildSupabase({ id: "user-1" }));
    isAdminViewerMock.mockReturnValue(false);
    getCollectionProgressForUserMock.mockResolvedValue([]);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.isAdminViewer).toBe(false);
    expect(getCollectionProgressForUserMock).toHaveBeenCalledWith("user-1", false);
  });

  test("repository が例外の場合_500で items空配列", async () => {
    createClientMock.mockResolvedValue(buildSupabase({ id: "user-1" }));
    isAdminViewerMock.mockReturnValue(false);
    getCollectionProgressForUserMock.mockRejectedValue(new Error("db error"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.items).toEqual([]);
    errorSpy.mockRestore();
  });
});
