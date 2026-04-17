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
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function createThenableResult(result: { data: unknown; error: unknown }) {
  return {
    then(
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled as never, onRejected as never);
    },
  };
}

function createNotificationsChain(result: { data: unknown; error: unknown }) {
  const thenable = createThenableResult(result);
  const orMock = jest.fn(() => thenable);
  const limitReturn = Object.assign(thenable, { or: orMock });
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(() => limitReturn),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return { builder, orMock };
}

function createInChain(result: { data: unknown; error: unknown }) {
  const thenable = createThenableResult(result);
  const builder = {
    select: jest.fn(),
    in: jest.fn(() => thenable),
  };
  builder.select.mockReturnValue(builder);
  return builder;
}

function setupSupabaseFromTables(config: {
  notifications: { data: unknown; error: unknown };
  profiles?: { data: unknown; error: unknown };
  generatedImages?: { data: unknown; error: unknown };
  comments?: { data: unknown; error: unknown };
}) {
  const notif = createNotificationsChain(config.notifications);
  const profilesBuilder = createInChain(
    config.profiles ?? { data: [], error: null },
  );
  const generatedImagesBuilder = createInChain(
    config.generatedImages ?? { data: [], error: null },
  );
  const commentsBuilder = createInChain(
    config.comments ?? { data: [], error: null },
  );

  const from = jest.fn((table: string) => {
    if (table === "notifications") return notif.builder;
    if (table === "profiles") return profilesBuilder;
    if (table === "generated_images") return generatedImagesBuilder;
    if (table === "comments") return commentsBuilder;
    throw new Error(`unexpected table: ${JSON.stringify(table)}`);
  });

  mockCreateClient.mockResolvedValue({ from } as never);
  return { from, orMock: notif.orMock };
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

  test("GET_0件の場合_200で空配列", async () => {
    // Spec: NOTIFGET-003
    const { from } = setupSupabaseFromTables({
      notifications: { data: [], error: null },
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: unknown[];
      nextCursor: unknown;
    };

    expect(res.status).toBe(200);
    expect(body.notifications).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(from).toHaveBeenCalledWith("notifications");
    expect(from).toHaveBeenCalledTimes(1);
  });

  test("GET_通知クエリエラーの場合_500で取得失敗", async () => {
    // Spec: NOTIFGET-004
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    setupSupabaseFromTables({
      notifications: { data: null, error: { message: "db" } },
    });

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
    // Spec: NOTIFGET-005
    const rows = [
      {
        id: "n1",
        created_at: "2024-01-03T00:00:00Z",
        recipient_id: "user-1",
        actor_id: null,
        entity_type: "like",
        entity_id: null,
      },
      {
        id: "n2",
        created_at: "2024-01-02T00:00:00Z",
        recipient_id: "user-1",
        actor_id: null,
        entity_type: "like",
        entity_id: null,
      },
      {
        id: "n3",
        created_at: "2024-01-01T00:00:00Z",
        recipient_id: "user-1",
        actor_id: null,
        entity_type: "like",
        entity_id: null,
      },
    ];
    setupSupabaseFromTables({
      notifications: { data: rows, error: null },
    });

    const res = await GET(
      createRequest("http://localhost/api/notifications?limit=2"),
    );
    const body = (await res.json()) as {
      notifications: Array<{ id: string }>;
      nextCursor: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.notifications).toHaveLength(2);
    expect(body.notifications.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(body.nextCursor).toBeTruthy();
    const decoded = Buffer.from(body.nextCursor!, "base64").toString();
    expect(decoded).toBe("2024-01-02T00:00:00Z|n2");
  });

  test("GET_limit以下の件数の場合_全件返しnextCursorなし", async () => {
    // Spec: NOTIFGET-006
    const rows = [
      {
        id: "n1",
        created_at: "2024-01-01T00:00:00Z",
        recipient_id: "user-1",
        actor_id: null,
        entity_type: "like",
        entity_id: null,
      },
    ];
    setupSupabaseFromTables({
      notifications: { data: rows, error: null },
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

  test("GET_有効なcursorの場合_ORフィルタを適用する", async () => {
    // Spec: NOTIFGET-007
    const cursor = Buffer.from(
      "2024-01-01T00:00:00Z|prev-id",
    ).toString("base64");
    const { orMock } = setupSupabaseFromTables({
      notifications: { data: [], error: null },
    });

    await GET(
      createRequest(
        `http://localhost/api/notifications?cursor=${encodeURIComponent(cursor)}`,
      ),
    );

    expect(orMock).toHaveBeenCalledWith(
      "created_at.lt.2024-01-01T00:00:00Z,and(created_at.eq.2024-01-01T00:00:00Z,id.lt.prev-id)",
    );
  });

  test("GET_cursor復号例外の場合_フィルタを付けず続行", async () => {
    // Spec: NOTIFGET-008
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const { orMock } = setupSupabaseFromTables({
      notifications: { data: [], error: null },
    });

    const bufSpy = jest.spyOn(Buffer, "from").mockImplementation((input, enc) => {
      if (enc === "base64" && input === "__CURSOR_THROW__") {
        throw new Error("decode fail");
      }
      return jest.requireActual("node:buffer").Buffer.from(input as never, enc as never);
    });

    try {
      await GET(
        createRequest(
          "http://localhost/api/notifications?cursor=__CURSOR_THROW__",
        ),
      );
      expect(orMock).not.toHaveBeenCalled();
    } finally {
      bufSpy.mockRestore();
      consoleError.mockRestore();
    }
  });

  test("GET_actor取得済みの場合_actor詳細を付与する", async () => {
    // Spec: NOTIFGET-009
    const rows = [
      {
        id: "n1",
        created_at: "2024-01-01T00:00:00Z",
        recipient_id: "user-1",
        actor_id: "actor-1",
        entity_type: "like",
        entity_id: null,
      },
    ];
    setupSupabaseFromTables({
      notifications: { data: rows, error: null },
      profiles: {
        data: [
          {
            user_id: "actor-1",
            nickname: "Actor One",
            avatar_url: "https://av.example/a.png",
          },
        ],
        error: null,
      },
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        id: string;
        actor: { id: string; nickname: string; avatar_url: string | null } | null;
      }>;
    };

    expect(res.status).toBe(200);
    expect(body.notifications[0].actor).toEqual({
      id: "actor-1",
      nickname: "Actor One",
      avatar_url: "https://av.example/a.png",
    });
  });

  test("GET_post実体の場合_サムネとcaptionを付与する", async () => {
    // Spec: NOTIFGET-010
    const rows = [
      {
        id: "n1",
        created_at: "2024-01-01T00:00:00Z",
        recipient_id: "user-1",
        actor_id: null,
        entity_type: "post",
        entity_id: "post-1",
      },
    ];
    setupSupabaseFromTables({
      notifications: { data: rows, error: null },
      generatedImages: {
        data: [
          {
            id: "post-1",
            image_url: "https://img.example/full.png",
            storage_path: "u/p.png",
            storage_path_thumb: "u/p_thumb.webp",
            caption: "Hello",
          },
        ],
        error: null,
      },
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

  test("GET_comment通知でimage_id保持済みの場合_投稿サムネを補完する", async () => {
    // Spec: NOTIFGET-010A
    const rows = [
      {
        id: "n1",
        created_at: "2024-01-01T00:00:00Z",
        recipient_id: "user-1",
        actor_id: "actor-1",
        type: "comment",
        entity_type: "comment",
        entity_id: "comment-parent-1",
        data: {
          image_id: "post-77",
          comment_id: "comment-reply-1",
          comment_content: "reply body",
        },
      },
    ];
    const { from } = setupSupabaseFromTables({
      notifications: { data: rows, error: null },
      profiles: {
        data: [
          {
            user_id: "actor-1",
            nickname: "Reply Actor",
            avatar_url: "https://av.example/reply.png",
          },
        ],
        error: null,
      },
      generatedImages: {
        data: [
          {
            id: "post-77",
            image_url: "https://img.example/post-77.png",
            storage_path: "u/post-77.png",
            storage_path_thumb: "u/post-77_thumb.webp",
            caption: "Reply target",
          },
        ],
        error: null,
      },
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        data: { image_id?: string };
        post: { image_url: string | null; caption: string | null } | null;
      }>;
    };

    expect(res.status).toBe(200);
    expect(body.notifications[0].data.image_id).toBe("post-77");
    expect(body.notifications[0].post).toEqual({
      image_url: "https://cdn.example/thumb.webp",
      caption: "Reply target",
    });
    expect(from).not.toHaveBeenCalledWith("comments");
  });

  test("GET_comment通知でimage_id欠落時_commentsから投稿IDを解決する", async () => {
    // Spec: NOTIFGET-010B
    const rows = [
      {
        id: "n1",
        created_at: "2024-01-01T00:00:00Z",
        recipient_id: "user-1",
        actor_id: "actor-1",
        type: "comment",
        entity_type: "comment",
        entity_id: "comment-parent-2",
        data: {
          comment_id: "comment-reply-2",
          comment_content: "reply body",
        },
      },
    ];
    const { from } = setupSupabaseFromTables({
      notifications: { data: rows, error: null },
      comments: {
        data: [
          {
            id: "comment-parent-2",
            image_id: "post-88",
          },
        ],
        error: null,
      },
      generatedImages: {
        data: [
          {
            id: "post-88",
            image_url: "https://img.example/post-88.png",
            storage_path: "u/post-88.png",
            storage_path_thumb: "u/post-88_thumb.webp",
            caption: "Resolved target",
          },
        ],
        error: null,
      },
    });

    const res = await GET(createRequest("http://localhost/api/notifications"));
    const body = (await res.json()) as {
      notifications: Array<{
        data: { image_id?: string };
        post: { image_url: string | null; caption: string | null } | null;
      }>;
    };

    expect(res.status).toBe(200);
    expect(body.notifications[0].data.image_id).toBe("post-88");
    expect(body.notifications[0].post).toEqual({
      image_url: "https://cdn.example/thumb.webp",
      caption: "Resolved target",
    });
    expect(from).toHaveBeenCalledWith("comments");
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
