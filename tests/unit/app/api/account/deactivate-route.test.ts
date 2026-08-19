/** @jest-environment node */

/**
 * POST /api/account/deactivate のうち、**フィード CTA キャッシュの失効**だけを見る。
 *
 * `validate_derived_prompt_source` は原作者の `profiles.deletion_scheduled_at` を
 * 利用不可条件に入れている。つまり退会申請が通った瞬間、その作者の原作は
 * 利用不可へ落ちる。prompt-actions は閲覧者をまたいで共有しているので、
 * ここで失効させないと数分間「使える」と返し続け、押した人が生成 API で弾かれる。
 */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/posts/lib/prompt-action-cache", () => ({
  revalidatePromptActions: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/account/deactivate/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePromptActions } from "@/features/posts/lib/prompt-action-cache";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRevalidate = revalidatePromptActions as jest.MockedFunction<
  typeof revalidatePromptActions
>;

const USER_ID = "11111111-1111-4111-8111-111111111111";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** OAuth ログイン(パスワード再認証が不要な経路)の利用者。 */
function mockOAuthUser() {
  mockGetUser.mockResolvedValue({
    id: USER_ID,
    email: "user@example.test",
    app_metadata: { provider: "google", providers: ["google"] },
  } as never);
}

function mockRpc(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  mockCreateClient.mockResolvedValue({
    rpc,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return rpc;
}

describe("POST /api/account/deactivate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOAuthUser();
  });

  test("退会申請が通ったらフィードCTAのキャッシュを失効させる", async () => {
    const rpc = mockRpc({
      data: [{ status: "scheduled", scheduled_for: "2026-09-18T00:00:00.000Z" }],
      error: null,
    });

    const response = await POST(buildRequest({ confirmText: "DELETE" }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("request_account_deletion", {
      p_user_id: USER_ID,
      p_confirm_text: "DELETE",
      p_reauth_ok: true,
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  test("⭐RPC が失敗したら失効させない(退会していないのにCTAを消さない)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRpc({ data: null, error: { code: "P0001" } });

    const response = await POST(buildRequest({ confirmText: "DELETE" }));

    expect(response.status).toBe(500);
    expect(mockRevalidate).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("確認文字列が違うときは RPC も失効も走らない", async () => {
    const rpc = mockRpc({ data: [], error: null });

    const response = await POST(buildRequest({ confirmText: "delete" }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  test("未ログインは 401(失効も走らない)", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await POST(buildRequest({ confirmText: "DELETE" }));

    expect(response.status).toBe(401);
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
