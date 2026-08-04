/** @jest-environment node */

/**
 * 審査キュー API の回帰テスト。
 *
 * prompt_visibility を返すことを固定する (REQ-018)。select の列挙から
 * 落とすとバッジが黙って消える（型は optional なのでコンパイルは通る）ため、
 * 列の指定とレスポンスの通過を機械的に検査する。
 */

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    connection: jest.fn(async () => {}),
  };
});

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/moderation/posts/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<
  typeof requireAdmin
>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/moderation/posts");
}

/** generated_images と post_reports の2テーブルだけを扱う最小のスタブ。 */
function createQueueAdminStub(options: {
  posts: Array<Record<string, unknown>>;
}) {
  const selectedColumns: Record<string, string> = {};

  const client = {
    from: (table: string) => {
      if (table === "generated_images") {
        return {
          select: (columns: string) => {
            selectedColumns[table] = columns;
            return {
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    range: () =>
                      Promise.resolve({ data: options.posts, error: null }),
                  }),
                }),
              }),
            };
          },
        };
      }
      // post_reports
      return {
        select: (columns: string) => {
          selectedColumns[table] = columns;
          return {
            in: () => Promise.resolve({ data: [], error: null }),
          };
        },
      };
    },
  };

  return { client, selectedColumns };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
});

describe("GET /api/admin/moderation/posts", () => {
  it("prompt_visibility を select してレスポンスへ通す", async () => {
    const { client, selectedColumns } = createQueueAdminStub({
      posts: [
        {
          id: "post-1",
          user_id: "author-1",
          image_url: null,
          storage_path_thumb: "thumb/a.webp",
          storage_path: "a.png",
          caption: "test",
          moderation_status: "pending",
          moderation_reason: null,
          posted_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
          prompt_visibility: "private",
        },
      ],
    });
    mockCreateAdminClient.mockReturnValue(client as never);

    const response = await GET(createRequest());
    const body = (await response.json()) as {
      posts: Array<{ prompt_visibility?: string }>;
    };

    expect(response.status).toBe(200);
    // 列挙から落とすとバッジが黙って消えるため、指定そのものを固定する
    expect(selectedColumns["generated_images"]).toContain("prompt_visibility");
    expect(body.posts[0].prompt_visibility).toBe("private");
  });

  it("管理者でなければ拒否する", async () => {
    const { NextResponse } = jest.requireActual("next/server");
    mockRequireAdmin.mockRejectedValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(403);
  });
});
