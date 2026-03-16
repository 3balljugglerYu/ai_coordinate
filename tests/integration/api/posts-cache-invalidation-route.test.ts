/** @jest-environment node */

import type { NextRequest } from "next/server";
import { POST as postRoute } from "@/app/api/posts/post/route";
import { PUT as updateRoute } from "@/app/api/posts/update/route";
import { DELETE as deleteRoute } from "@/app/api/posts/[id]/route";
import { revalidatePath, revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import {
  postImageServer,
  unpostImageServer,
} from "@/features/generation/lib/server-database";
import { createClient } from "@/lib/supabase/server";
import { getRouteLocale } from "@/lib/api/route-locale";

jest.mock("next/cache");
jest.mock("@/lib/auth");
jest.mock("@/features/generation/lib/server-database");
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/api/route-locale");

const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockPostImageServer = postImageServer as jest.MockedFunction<typeof postImageServer>;
const mockUnpostImageServer =
  unpostImageServer as jest.MockedFunction<typeof unpostImageServer>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockGetRouteLocale = getRouteLocale as jest.MockedFunction<
  typeof getRouteLocale
>;

type JsonRecord = Record<string, unknown>;

function createRequest(method: "POST" | "PUT" | "DELETE", body?: unknown): NextRequest {
  return new Request(`http://localhost/api/test`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

describe("Posts cache invalidation routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockRevalidateTag.mockImplementation(() => {});
    mockRevalidatePath.mockImplementation(() => {});
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({
      id: "user-1",
      email: "user-1@example.com",
    } as never);
    mockCreateClient.mockResolvedValue({
      rpc: jest.fn().mockResolvedValue({ data: 50, error: null }),
    } as never);
  });

  test("POST /api/posts/post_詳細系タグを即時失効し一覧系はmaxのまま再検証する", async () => {
    mockPostImageServer.mockResolvedValue({
      id: "post-1",
      user_id: "user-1",
      is_posted: true,
      caption: "fresh caption",
      posted_at: "2026-03-16T00:00:00.000Z",
    } as never);

    const response = await postRoute(
      createRequest("POST", {
        id: "post-1",
        caption: "fresh caption",
      })
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.id).toBe("post-1");
    expect(mockPostImageServer).toHaveBeenCalledWith("post-1", "fresh caption");
    expect(mockRevalidateTag).toHaveBeenCalledWith("home-posts", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("home-posts-week", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("search-posts", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("post-detail-post-1", {
      expire: 0,
    });
    expect(mockRevalidateTag).not.toHaveBeenCalledWith("post-detail-post-1", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("my-page-image-user-1-post-1", {
      expire: 0,
    });
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(
      "my-page-image-user-1-post-1",
      "max"
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/posts/post-1");
  });

  test("PUT /api/posts/update_詳細系タグを即時失効する", async () => {
    mockPostImageServer.mockResolvedValue({
      id: "post-2",
      user_id: "user-1",
      is_posted: true,
      caption: "updated caption",
      posted_at: "2026-03-16T00:00:00.000Z",
    } as never);

    const response = await updateRoute(
      createRequest("PUT", {
        id: "post-2",
        caption: "updated caption",
      })
    );

    expect(response.status).toBe(200);
    expect(mockPostImageServer).toHaveBeenCalledWith("post-2", "updated caption");
    expect(mockRevalidateTag).toHaveBeenCalledWith("home-posts", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("home-posts-week", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("search-posts", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("post-detail-post-2", {
      expire: 0,
    });
    expect(mockRevalidateTag).not.toHaveBeenCalledWith("post-detail-post-2", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("my-page-image-user-1-post-2", {
      expire: 0,
    });
  });

  test("DELETE /api/posts/[id]_詳細系とマイページ画像タグを即時失効する", async () => {
    mockUnpostImageServer.mockResolvedValue({
      id: "post-3",
      user_id: "user-1",
      is_posted: false,
    } as never);

    const response = await deleteRoute(createRequest("DELETE"), {
      params: Promise.resolve({ id: "post-3" }),
    });

    expect(response.status).toBe(200);
    expect(mockUnpostImageServer).toHaveBeenCalledWith("post-3", "user-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("home-posts", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("home-posts-week", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("search-posts", "max");
    expect(mockRevalidateTag).toHaveBeenCalledWith("post-detail-post-3", {
      expire: 0,
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("my-page-image-user-1-post-3", {
      expire: 0,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/posts/post-3");
  });
});
