/** @jest-environment node */

const getUserMock = jest.fn();
const createClientMock = jest.fn();

jest.mock("@/lib/auth", () => ({
  getUser: (...args: unknown[]) => getUserMock(...args),
}));
jest.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/style-presets/favorites/route";

const PRESET_ID = "0eff4dba-44cf-4c02-9c3f-306791d1c294";
const ORIGIN = "http://localhost:3000";

function buildRequest(
  method: "POST" | "DELETE",
  body: unknown,
  origin: string | null = ORIGIN,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest(`${ORIGIN}/api/style-presets/favorites`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

/** upsert/delete チェーンのスタブ。 */
function buildSupabase(error: unknown = null) {
  const upsert = jest.fn().mockResolvedValue({ error });
  const eq2 = jest.fn().mockResolvedValue({ error });
  const eq1 = jest.fn(() => ({ eq: eq2 }));
  const del = jest.fn(() => ({ eq: eq1 }));
  const from = jest.fn(() => ({ upsert, delete: del }));
  return { from, upsert, del, eq1, eq2 };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/style-presets/favorites", () => {
  test("未ログインは401(DBを触らない)", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await POST(buildRequest("POST", { presetId: PRESET_ID }));
    expect(res.status).toBe(401);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  test("presetIdがUUIDでなければ400", async () => {
    getUserMock.mockResolvedValue({ id: "user-1" });
    const res = await POST(buildRequest("POST", { presetId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  test("正常時: セッションuserのuser_idでupsert(冪等)", async () => {
    getUserMock.mockResolvedValue({ id: "user-1" });
    const supabase = buildSupabase();
    createClientMock.mockResolvedValue(supabase);

    const res = await POST(buildRequest("POST", { presetId: PRESET_ID }));

    expect(res.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledWith("style_preset_favorites");
    expect(supabase.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", preset_id: PRESET_ID },
      { onConflict: "user_id,preset_id", ignoreDuplicates: true },
    );
  });

  test("DBエラー時は500", async () => {
    getUserMock.mockResolvedValue({ id: "user-1" });
    createClientMock.mockResolvedValue(buildSupabase({ message: "boom" }));
    const res = await POST(buildRequest("POST", { presetId: PRESET_ID }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/style-presets/favorites", () => {
  test("正常時: user_id+preset_idで削除(冪等)", async () => {
    getUserMock.mockResolvedValue({ id: "user-1" });
    const supabase = buildSupabase();
    createClientMock.mockResolvedValue(supabase);

    const res = await DELETE(buildRequest("DELETE", { presetId: PRESET_ID }));

    expect(res.status).toBe(200);
    expect(supabase.del).toHaveBeenCalled();
    expect(supabase.eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.eq2).toHaveBeenCalledWith("preset_id", PRESET_ID);
  });

  test("未ログインは401", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await DELETE(buildRequest("DELETE", { presetId: PRESET_ID }));
    expect(res.status).toBe(401);
  });
});
