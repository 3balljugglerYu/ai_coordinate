/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/posts/lib/utils", () => ({
  getPostThumbUrl: jest.fn(() => "https://cdn.example/thumb.webp"),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/notifications/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockGetPostThumbUrl = getPostThumbUrl as jest.MockedFunction<
  typeof getPostThumbUrl
>;

function createRequest(url: string): NextRequest {
  const request = new Request(url, {
    headers: { "accept-language": "ja" },
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function createRequestEn(url: string): NextRequest {
  const request = new Request(url, {
    headers: { "accept-language": "en" },
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: {
      get: (name: string) =>
        name === "NEXT_LOCALE" ? { name: "NEXT_LOCALE", value: "en" } : undefined,
    },
  }) as NextRequest;
}

type RpcRow = {
  id: string;
  created_at: string;
  recipient_id?: string;
  actor_id?: string | null;
  type?: string;
  entity_type?: string;
  entity_id?: string | null;
  data?: Record<string, unknown>;
  resolved_image_id?: string | null;
  actor?: { user_id: string; nickname: string | null; avatar_url: string | null } | null;
  post?: {
    id: string;
    image_url: string | null;
    storage_path: string | null;
    storage_path_thumb: string | null;
    caption: string | null;
  } | null;
};

function row(partial: RpcRow): RpcRow {
  return {
    recipient_id: "user-1",
    actor_id: null,
    type: "like",
    entity_type: "post",
    entity_id: null,
    data: {},
    resolved_image_id: null,
    actor: null,
    post: null,
    ...partial,
  };
}

/** get_notifications_page を 1 回呼ぶだけになったので、rpc だけを用意する */
function setupRpc(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn(() => Promise.resolve(result));
  const from = jest.fn(() => {
    throw new Error("notifications must be read through get_notifications_page");
  });
  mockCreateClient.mockResolvedValue({ rpc, from } as never);
  return { rpc, from };
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: "user-1" } as never);
    mockGetPostThumbUrl.mockReturnValue("https://cdn.example/thumb.webp");
    mockCreateClient.mockReset();
  });

  test("GET_未認証の場合_401で認証必須", async () => {
    // Spec: NOTIFGET-001
    mockGetUser.mockResolvedValue(null);

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.errorCode).toBe("NOTIFICATIONS_AUTH_REQUIRED");
    expect(body.error).toBe("認証が必要です");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("GET_limit範囲外の場合_400でinvalidLimit", async () => {
    // Spec: NOTIFGET-002
    const res = await GET(
      createRequest("http://localhost/api/notifications?limit=0"),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("NOTIFICATIONS_INVALID_LIMIT");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("GET_limitが数字でない場合_400でinvalidLimit", async () => {
    // Spec: NOTIFGET-002(NaN は範囲の比較をすり抜けるため、20 件に補われてページ送りが壊れていた)
    const res = await GET(
      createRequest("http://localhost/api/notifications?limit=abc"),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("NOTIFICATIONS_INVALID_LIMIT");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("GET_0件の場合_200で空配列_問い合わせは1回", async () => {
    // Spec: NOTIFGET-003
    const { rpc, from } = setupRpc({ data: [], error: null });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: unknown[];
      nextCursor: unknown;
    };

    expect(res.status).toBe(200);
    expect(body.notifications).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_notifications_page", {
      p_user_id: "user-1",
      p_limit: 20,
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_notification_id: null,
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("GET_通知クエリエラーの場合_500で取得失敗", async () => {
    // Spec: NOTIFGET-004
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    setupRpc({ data: null, error: { message: "db" } });

    try {
      const res = await GET(createRequest("http://localhost/api/notifications"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.errorCode).toBe("NOTIFICATIONS_FETCH_FAILED");
      expect(body.error).toBe("通知の取得に失敗しました");
    } finally {
      consoleError.mockRestore();
    }
  });

  test("GET_limit超の行がある場合_切り詰めてnextCursorを返す", async () => {
    // Spec: NOTIFGET-005 (RPC は limit + 1 件返す)
    setupRpc({
      data: [
        row({ id: "n1", created_at: "2024-01-03T00:00:00Z" }),
        row({ id: "n2", created_at: "2024-01-02T00:00:00Z" }),
        row({ id: "n3", created_at: "2024-01-01T00:00:00Z" }),
      ],
      error: null,
    });

    const res = await GET(
      createRequest("http://localhost/api/notifications?limit=2"),
    );
    const body = (await res.json()) as {
      notifications: Array<{ id: string }>;
      nextCursor: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.notifications.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(body.nextCursor).toBeTruthy();
    const decoded = Buffer.from(body.nextCursor!, "base64").toString();
    expect(decoded).toBe("2024-01-02T00:00:00Z|n2");
  });

  test("GET_limit以下の件数の場合_全件返しnextCursorなし", async () => {
    // Spec: NOTIFGET-006
    setupRpc({
      data: [row({ id: "n1", created_at: "2024-01-01T00:00:00Z" })],
      error: null,
    });

    const res = await GET(
      createRequest("http://localhost/api/notifications?limit=10"),
    );
    const body = (await res.json()) as {
      notifications: unknown[];
      nextCursor: unknown;
    };

    expect(res.status).toBe(200);
    expect(body.notifications).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  test("GET_有効なcursorの場合_続きの位置をRPCへ渡す", async () => {
    // Spec: NOTIFGET-007
    const cursorId = "11111111-2222-3333-4444-555555555555";
    const cursor = Buffer.from(
      `2024-01-01T00:00:00Z|${cursorId}`,
    ).toString("base64");
    const { rpc } = setupRpc({ data: [], error: null });

    await GET(
      createRequest(
        `http://localhost/api/notifications?cursor=${encodeURIComponent(cursor)}`,
      ),
    );

    expect(rpc).toHaveBeenCalledWith(
      "get_notifications_page",
      expect.objectContaining({
        p_cursor_created_at: "2024-01-01T00:00:00Z",
        p_cursor_id: cursorId,
      }),
    );
  });

  test.each([
    ["base64でない", "__CURSOR__"],
    ["idがuuidでない", Buffer.from("2024-01-01T00:00:00Z|prev-id").toString("base64")],
    ["日時が読めない", Buffer.from("yesterday|11111111-2222-3333-4444-555555555555").toString("base64")],
  ])("GET_cursorが読めない場合(%s)_先頭から返す", async (_label, cursor) => {
    // Spec: NOTIFGET-008
    const { rpc } = setupRpc({ data: [], error: null });

    const res = await GET(
      createRequest(
        `http://localhost/api/notifications?cursor=${encodeURIComponent(cursor)}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "get_notifications_page",
      expect.objectContaining({ p_cursor_created_at: null, p_cursor_id: null }),
    );
  });

  test("GET_actor取得済みの場合_actor詳細を付与する", async () => {
    // Spec: NOTIFGET-009
    setupRpc({
      data: [
        row({
          id: "n1",
          created_at: "2024-01-01T00:00:00Z",
          actor_id: "actor-1",
          actor: {
            user_id: "actor-1",
            nickname: "Actor One",
            avatar_url: "https://av.example/a.png",
          },
        }),
      ],
      error: null,
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        actor: { id: string; nickname: string; avatar_url: string | null } | null;
        resolved_image_id?: unknown;
      }>;
    };

    expect(res.status).toBe(200);
    expect(body.notifications[0].actor).toEqual({
      id: "actor-1",
      nickname: "Actor One",
      avatar_url: "https://av.example/a.png",
    });
    expect(body.notifications[0]).not.toHaveProperty("resolved_image_id");
  });

  test("GET_post実体の場合_サムネとcaptionを付与する", async () => {
    // Spec: NOTIFGET-010
    setupRpc({
      data: [
        row({
          id: "n1",
          created_at: "2024-01-01T00:00:00Z",
          entity_type: "post",
          entity_id: "post-1",
          resolved_image_id: "post-1",
          post: {
            id: "post-1",
            image_url: "https://img.example/full.png",
            storage_path: "u/p.png",
            storage_path_thumb: "u/p_thumb.webp",
            caption: "Hello",
          },
        }),
      ],
      error: null,
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        post: { image_url: string | null; caption: string | null } | null;
      }>;
    };

    expect(res.status).toBe(200);
    expect(mockGetPostThumbUrl).toHaveBeenCalledWith({
      storage_path_thumb: "u/p_thumb.webp",
      storage_path: "u/p.png",
      image_url: "https://img.example/full.png",
    });
    expect(body.notifications[0].post).toEqual({
      image_url: "https://cdn.example/thumb.webp",
      caption: "Hello",
    });
  });

  test("GET_comment通知_RPCが解決した投稿IDをdata.image_idに入れる", async () => {
    // Spec: NOTIFGET-010A / NOTIFGET-010B
    // (コメントからの投稿の解決は get_notifications_page の中で行う)
    setupRpc({
      data: [
        row({
          id: "n1",
          created_at: "2024-01-01T00:00:00Z",
          actor_id: "actor-1",
          type: "comment",
          entity_type: "comment",
          entity_id: "comment-1",
          data: { comment_content: "かわいい" },
          resolved_image_id: "post-7",
          post: {
            id: "post-7",
            image_url: null,
            storage_path: "u/7.png",
            storage_path_thumb: "u/7_thumb.webp",
            caption: "春",
          },
        }),
      ],
      error: null,
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        data: Record<string, unknown>;
        post: { caption: string | null } | null;
      }>;
    };

    expect(res.status).toBe(200);
    expect(body.notifications[0].data).toEqual({
      comment_content: "かわいい",
      image_id: "post-7",
    });
    expect(body.notifications[0].post).toEqual(
      expect.objectContaining({ caption: "春" }),
    );
  });

  test("GET_id指定の場合_本人の通知1件をRPCで返す", async () => {
    // Spec: NOTIFGET-014 (Realtime 新着の enrichment 用の単一取得)
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { rpc } = setupRpc({
      data: [
        row({
          id,
          created_at: "2024-01-01T00:00:00Z",
          actor_id: "deriver-1",
          type: "derived_post_published",
          actor: { user_id: "deriver-1", nickname: "ゆき", avatar_url: null },
        }),
      ],
      error: null,
    });

    const res = await GET(
      createRequest(`http://localhost/api/notifications?id=${id}`),
    );
    const body = (await res.json()) as {
      notifications: Array<{ id: string; actor: { nickname: string } | null }>;
      nextCursor: string | null;
    };

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_notifications_page", {
      p_user_id: "user-1",
      p_limit: 1,
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_notification_id: id,
    });
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].actor).toEqual(
      expect.objectContaining({ nickname: "ゆき" }),
    );
    expect(body.nextCursor).toBeNull();
  });

  test("GET_idが不正な形式の場合_400を返す", async () => {
    const { rpc } = setupRpc({ data: [], error: null });

    const res = await GET(
      createRequest("http://localhost/api/notifications?id=not-a-uuid"),
    );

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("GET_匿名通知_actorを付けずサムネは付ける", async () => {
    // Spec: NOTIFGET-015 / NOTIFGET-016 (B案 REQ-005)
    // RPC は actor_id=本人のプロフィールを返すが、匿名通知には付けない。
    const self = { user_id: "user-1", nickname: "本人", avatar_url: null };
    setupRpc({
      data: [
        row({
          id: "n1",
          created_at: "2024-01-02T00:00:00Z",
          actor_id: "user-1",
          type: "derived_usage_milestone",
          entity_id: "origin-post-1",
          data: { milestone: 5 },
          actor: self,
          resolved_image_id: "origin-post-1",
          post: {
            id: "origin-post-1",
            image_url: null,
            storage_path: "u/o.png",
            storage_path_thumb: null,
            caption: "桜ドレス",
          },
        }),
        row({
          id: "n2",
          created_at: "2024-01-01T00:00:00Z",
          actor_id: "user-1",
          type: "like",
          entity_id: "post-9",
          actor: self,
        }),
      ],
      error: null,
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        id: string;
        actor: { nickname: string } | null;
        post: { caption: string | null } | null;
      }>;
    };

    expect(res.status).toBe(200);
    const milestone = body.notifications.find((n) => n.id === "n1");
    const like = body.notifications.find((n) => n.id === "n2");
    expect(milestone?.actor).toBeNull();
    expect(milestone?.post).toEqual(
      expect.objectContaining({ caption: "桜ドレス" }),
    );
    expect(like?.actor).toEqual(expect.objectContaining({ nickname: "本人" }));
  });

  test("GET_重大カテゴリの措置通知_サムネを付けない", async () => {
    setupRpc({
      data: [
        row({
          id: "n1",
          created_at: "2024-01-01T00:00:00Z",
          actor_id: "user-1",
          type: "post_moderation_removed",
          data: { policy_code: "csam" },
          resolved_image_id: "post-1",
          post: {
            id: "post-1",
            image_url: null,
            storage_path: "u/p.png",
            storage_path_thumb: null,
            caption: "x",
          },
        }),
      ],
      error: null,
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{ post: unknown }>;
    };

    expect(res.status).toBe(200);
    expect(body.notifications[0].post).toBeNull();
  });

  test("GET_想定外例外の場合_500で取得失敗", async () => {
    // Spec: NOTIFGET-011
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateClient.mockRejectedValueOnce(new Error("no db"));

    try {
      const res = await GET(createRequest("http://localhost/api/notifications"));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.errorCode).toBe("NOTIFICATIONS_FETCH_FAILED");
    } finally {
      consoleError.mockRestore();
    }
  });

  test("GET_英語ロケールの場合_英語のinvalidLimit", async () => {
    // Spec: NOTIFGET-012
    const res = await GET(
      createRequestEn("http://localhost/api/notifications?limit=101"),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe("Limit must be between 1 and 100.");
  });
});
