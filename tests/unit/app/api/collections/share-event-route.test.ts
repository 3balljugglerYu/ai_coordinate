/** @jest-environment node */

/**
 * POST /api/collections/share-event
 *
 * 「Xで応募する」と通常のシェアが、同じ mount_shared しか記録していなかったため
 * 応募数を分離できなかった(ファッション雑誌企画の28件は両者の合算)。
 *
 * ここで守りたいのは次の2点。
 *  - 応募でも mount_shared は**必ず記録される**(シェア発行数の定義を変えない。
 *    変えると過去の企画と比較できなくなる)
 *  - 応募のときだけ lottery_entry_click が**上乗せ**される
 * 集計側はこの関係に依存して「通常シェアのみ = mount_shared - lottery_entry_click」と読む。
 */

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/style/lib/style-usage-events", () => ({
  recordStyleUsageEvent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/collections/share-event/route";
import { createClient } from "@/lib/supabase/server";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRecord = recordStyleUsageEvent as jest.MockedFunction<
  typeof recordStyleUsageEvent
>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPLETION_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_KEY = "fashion_magazine_summer";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/collections/share-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 本人の completed 行が1件見つかる状態。 */
function mockSupabase(options?: { user?: boolean; completion?: boolean }) {
  const hasUser = options?.user ?? true;
  const hasCompletion = options?.completion ?? true;

  const maybeSingle = jest.fn().mockResolvedValue(
    hasCompletion
      ? { data: { id: COMPLETION_ID, category_key: CATEGORY_KEY }, error: null }
      : { data: null, error: null },
  );
  const eq2 = jest.fn(() => ({ maybeSingle }));
  const eq1 = jest.fn(() => ({ eq: eq2 }));
  const select = jest.fn(() => ({ eq: eq1 }));

  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: hasUser ? { id: USER_ID } : null } }),
    },
    from: jest.fn(() => ({ select })),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function recordedEventTypes(): string[] {
  return mockRecord.mock.calls.map((call) => call[0].eventType);
}

describe("POST /api/collections/share-event", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecord.mockResolvedValue(undefined);
    mockSupabase();
  });

  test("通常のシェアは mount_shared だけを記録する", async () => {
    const response = await POST(buildRequest({ completionId: COMPLETION_ID }));

    expect(response.status).toBe(200);
    expect(recordedEventTypes()).toEqual(["mount_shared"]);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        authState: "authenticated",
        eventType: "mount_shared",
        // style_id は後方互換で残している(過去分の集計がこの列を見ている)
        styleId: CATEGORY_KEY,
        categoryKey: CATEGORY_KEY,
        viewerKey: `u:${USER_ID}`,
      }),
    );
  });

  test("⭐応募は mount_shared に加えて lottery_entry_click を記録する", async () => {
    const response = await POST(
      buildRequest({ completionId: COMPLETION_ID, lotteryEntry: true }),
    );

    expect(response.status).toBe(200);
    expect(recordedEventTypes()).toEqual(["mount_shared", "lottery_entry_click"]);
  });

  test("⭐lotteryEntry が true 以外なら通常シェア扱い(文字列で偽装できない)", async () => {
    await POST(
      buildRequest({ completionId: COMPLETION_ID, lotteryEntry: "true" }),
    );

    expect(recordedEventTypes()).toEqual(["mount_shared"]);
  });

  /*
    片方の記録が落ちても、もう片方は試みる。mount_shared だけ失敗して
    lottery_entry_click が残ると、応募数がシェア数を上回って見える。
  */
  test("⭐mount_shared の記録が失敗しても応募イベントは記録を試みる", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRecord.mockRejectedValueOnce(new Error("insert failed"));

    const response = await POST(
      buildRequest({ completionId: COMPLETION_ID, lotteryEntry: true }),
    );

    expect(response.status).toBe(200);
    expect(recordedEventTypes()).toEqual(["mount_shared", "lottery_entry_click"]);
    errorSpy.mockRestore();
  });

  test("未ログインは 401(記録もしない)", async () => {
    mockSupabase({ user: false });

    const response = await POST(
      buildRequest({ completionId: COMPLETION_ID, lotteryEntry: true }),
    );

    expect(response.status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test("他人の台紙・存在しない台紙は 404(記録もしない)", async () => {
    mockSupabase({ completion: false });

    const response = await POST(
      buildRequest({ completionId: COMPLETION_ID, lotteryEntry: true }),
    );

    expect(response.status).toBe(404);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test("completionId が UUID でなければ 400", async () => {
    const response = await POST(buildRequest({ completionId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
