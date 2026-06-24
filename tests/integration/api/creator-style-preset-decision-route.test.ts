/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/lib/security/same-origin");
jest.mock("@/features/style-presets/lib/style-preset-repository");
jest.mock("@/lib/admin-audit");
jest.mock("@/features/style-presets/lib/revalidate-style-presets");

import { NextRequest, NextResponse } from "next/server";
// app/api/admin/... から import できること自体が「ルートが正しい配置にある」回帰ガード
// (MUST-ADDRESS-001: (app) グループに置くと /api では配信されず承認/却下が 404 になる)。
import { POST } from "@/app/api/admin/style-presets/submissions/[id]/route";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import {
  approveCreatorStylePreset,
  rejectCreatorStylePreset,
} from "@/features/style-presets/lib/style-preset-repository";
import { revalidateStylePresets } from "@/features/style-presets/lib/revalidate-style-presets";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockEnsureSameOrigin = ensureSameOrigin as jest.MockedFunction<
  typeof ensureSameOrigin
>;
const mockApprove = approveCreatorStylePreset as jest.MockedFunction<
  typeof approveCreatorStylePreset
>;
const mockReject = rejectCreatorStylePreset as jest.MockedFunction<
  typeof rejectCreatorStylePreset
>;
const mockRevalidate = revalidateStylePresets as jest.MockedFunction<
  typeof revalidateStylePresets
>;

function makeRequest(action: string) {
  return new NextRequest(
    "http://localhost/api/admin/style-presets/submissions/p-1",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }
  );
}

const params = Promise.resolve({ id: "p-1" });

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureSameOrigin.mockReturnValue(null); // same-origin OK
  mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
});

describe("POST /api/admin/style-presets/submissions/[id]", () => {
  test("非adminは requireAdmin の NextResponse をそのまま返す", async () => {
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    );

    const res = await POST(makeRequest("approve"), { params });

    expect(res.status).toBe(401);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  test("approve は承認RPCを呼び published を返し、キャッシュを無効化する", async () => {
    mockApprove.mockResolvedValue({ id: "p-1", status: "published" } as never);

    const res = await POST(makeRequest("approve"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: "p-1", status: "published" });
    expect(mockApprove).toHaveBeenCalledWith("p-1", "admin-1");
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  test("reject は却下RPCを呼び、キャッシュ無効化はしない(公開変化なし)", async () => {
    mockReject.mockResolvedValue({ id: "p-1", status: "rejected" } as never);

    const res = await POST(makeRequest("reject"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: "p-1", status: "rejected" });
    expect(mockReject).toHaveBeenCalledWith("p-1", "admin-1");
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  test("不正な action は 400", async () => {
    const res = await POST(makeRequest("delete"), { params });
    expect(res.status).toBe(400);
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();
  });
});
