/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPost } from "@/features/posts/lib/server-api";

jest.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  getAdminUserIds: jest.fn(() => []),
}));

jest.mock("@/features/generation/lib/prompt-visibility", () => ({
  redactSensitivePrompt: (post: unknown) => post,
}));

type QueryBuilder = {
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  is: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  update: jest.Mock;
};

function createPngHeader(width: number, height: number): ArrayBuffer {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function createSupabaseMock(
  postOverrides: Partial<{
    image_url: string | null;
    storage_path: string | null;
    aspect_ratio: string | null;
    width: number | null;
    height: number | null;
  }> = {},
) {
  const updateGeneratedImage = jest.fn();
  const postRow = {
    id: "post-1",
    user_id: "author-1",
    image_url: null,
    storage_path: "generated/path.png",
    prompt: "prompt",
    background_change: false,
    is_posted: true,
    moderation_status: "visible",
    caption: null,
    view_count: 7,
    aspect_ratio: null,
    width: null,
    height: null,
    created_at: "2026-04-26T00:00:00.000Z",
    updated_at: "2026-04-26T00:00:00.000Z",
    ...postOverrides,
  };

  const from = jest.fn((table: string): QueryBuilder => {
    const builder = {} as QueryBuilder;
    let updating = false;
    let commentsIsCallCount = 0;
    let selectColumns: unknown;
    let selectOptions: { count?: string; head?: boolean } | undefined;

    builder.select = jest.fn((columns?: unknown, options?: unknown) => {
      selectColumns = columns;
      selectOptions = options as { count?: string; head?: boolean } | undefined;
      return builder;
    });
    builder.eq = jest.fn(() => {
      if (updating) {
        return Promise.resolve({ error: null });
      }
      if (table === "likes" && selectColumns === "*") {
        return Promise.resolve({ count: 1, error: null });
      }
      return builder;
    });
    builder.in = jest.fn(() => builder);
    builder.is = jest.fn(() => builder);
    builder.single = jest.fn(async () => {
      if (table === "generated_images") {
        return { data: postRow, error: null };
      }
      if (table === "profiles") {
        return {
          data: {
            user_id: "author-1",
            nickname: "Author",
            avatar_url: "https://cdn.example/avatar.png",
            subscription_plan: "standard",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    builder.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
    builder.update = jest.fn((updates: Record<string, unknown>) => {
      updating = true;
      updateGeneratedImage(updates);
      return builder;
    });

    if (table === "likes") {
      builder.in = jest.fn(async () => ({
        data: [{ image_id: "post-1" }],
        error: null,
      }));
    }

    if (table === "comments") {
      builder.is = jest.fn(() => {
        commentsIsCallCount += 1;
        if (commentsIsCallCount >= 2) {
          if (selectOptions?.count === "exact" && selectOptions.head) {
            return Promise.resolve({ count: 2, error: null });
          }
          return Promise.resolve({
            data: [{ image_id: "post-1" }, { image_id: "post-1" }],
            error: null,
          });
        }
        return builder;
      });
    }

    return builder;
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    updateGeneratedImage,
  };
}

describe("getPost", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const createClientMock = createClient as jest.MockedFunction<
    typeof createClient
  >;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => createPngHeader(2048, 1024),
    } as never);
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
    jest.restoreAllMocks();
  });

  it("computes missing dimensions through the shared post image URL resolver", async () => {
    const { supabase, updateGeneratedImage } = createSupabaseMock();
    createClientMock.mockResolvedValue(supabase);

    const post = await getPost("post-1", null, true);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://supabase.example/storage/v1/object/public/generated-images/generated/path.png",
      expect.objectContaining({
        method: "GET",
        headers: { Range: "bytes=0-65535" },
      }),
    );
    expect(updateGeneratedImage).toHaveBeenCalledWith({
      aspect_ratio: "landscape",
      width: 2048,
      height: 1024,
    });
    expect(post).toEqual(
      expect.objectContaining({
        id: "post-1",
        like_count: 1,
        comment_count: 2,
        aspect_ratio: "landscape",
        width: 2048,
        height: 1024,
      }),
    );
  });

  it("keeps dimensions empty when no image URL can be resolved", async () => {
    const { supabase, updateGeneratedImage } = createSupabaseMock({
      image_url: null,
      storage_path: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const post = await getPost("post-1", null, true);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(updateGeneratedImage).not.toHaveBeenCalled();
    expect(post).toEqual(
      expect.objectContaining({
        id: "post-1",
        aspect_ratio: null,
        width: null,
        height: null,
      }),
    );
  });
});
