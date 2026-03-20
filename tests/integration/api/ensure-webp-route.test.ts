/** @jest-environment node */

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: jest.fn(),
  };
});

jest.mock("@/lib/env", () => ({
  env: {
    CRON_SECRET: "cron-secret",
  },
}));

jest.mock("@/features/generation/lib/webp-storage", () => ({
  ensureWebPVariants: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { after } from "next/server";
import { POST } from "@/app/api/internal/generated-images/ensure-webp/route";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";

const mockAfter = after as jest.MockedFunction<typeof after>;
const mockEnsureWebPVariants = ensureWebPVariants as jest.MockedFunction<
  typeof ensureWebPVariants
>;

function createRequest(body: unknown, token?: string): NextRequest {
  return new Request("http://localhost/api/internal/generated-images/ensure-webp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/internal/generated-images/ensure-webp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAfter.mockImplementation((task) => {
      if (typeof task === "function") {
        void task();
      }
    });
    mockEnsureWebPVariants.mockResolvedValue({
      status: "created",
      thumbPath: "user-1/image_thumb.webp",
      displayPath: "user-1/image_display.webp",
    });
  });

  test("不正なBearer tokenの場合は401を返す", async () => {
    // Spec: EWEBP-001
    const response = await POST(
      createRequest({ imageId: "image-1" }, "wrong-secret")
    );

    expect(response.status).toBe(401);
    expect(mockEnsureWebPVariants).not.toHaveBeenCalled();
  });

  test("imageIdがない場合は400を返す", async () => {
    // Spec: EWEBP-002
    const response = await POST(createRequest({}, "cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "imageId is required" });
    expect(mockEnsureWebPVariants).not.toHaveBeenCalled();
  });

  test("正しいBearer tokenの場合は202を返しafterでhelperを実行する", async () => {
    // Spec: EWEBP-003
    const response = await POST(
      createRequest({ imageId: "image-1" }, "cron-secret")
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ accepted: true });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockEnsureWebPVariants).toHaveBeenCalledWith("image-1");
  });
});
