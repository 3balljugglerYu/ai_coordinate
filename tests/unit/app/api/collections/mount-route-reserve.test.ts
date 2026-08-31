/** @jest-environment node */

const createClientMock = jest.fn();
const createAdminClientMock = jest.fn();
const isAdminViewerMock = jest.fn();
const isCollectionDisplayPeriodActiveMock = jest.fn();

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

jest.mock("@/lib/env", () => ({
  isAdminViewer: (...args: unknown[]) => isAdminViewerMock(...args),
}));

jest.mock("@/features/collections/lib/collection-display-period", () => ({
  isCollectionDisplayPeriodActive: (...args: unknown[]) =>
    isCollectionDisplayPeriodActiveMock(...args),
}));

jest.mock("@/features/collections/lib/mount-layouts", () => ({
  resolveMountSlots: jest.fn(),
}));

jest.mock("@/features/collections/lib/compose-mount", () => ({
  composeMount: jest.fn(),
}));

jest.mock("@/features/collections/lib/compose-mount-ogp", () => ({
  composeMountOgp: jest.fn(),
  composeMountOgpFromTemplate: jest.fn(),
  composeDefaultOgp: jest.fn(),
  DEFAULT_OGP_TEMPLATE_PATH: "default-ogp.png",
  ogpPathFromMountPath: jest.fn(() => null),
  parseOgpMountPlacement: jest.fn(),
}));

jest.mock("@/features/collections/lib/representative-images", () => ({
  getRepresentativeImagesForCategory: jest.fn(),
}));

jest.mock("@/features/collections/lib/completion-feed-post", () => ({
  refreshCompletionFeedPostImage: jest.fn(),
}));

jest.mock("@/features/collections/lib/resolve-selected-images", () => ({
  resolveSelectedImages: jest.fn(),
}));

jest.mock("@/features/style/lib/style-usage-events", () => ({
  recordStyleUsageEvent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/collections/mount/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "http://localhost:3000";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest(`${ORIGIN}/api/collections/mount`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
    },
    body: JSON.stringify(body),
  });
}

function buildSessionClient() {
  const rpc = jest.fn().mockResolvedValue({
    data: null,
    error: { message: "stop at reserve" },
  });
  createClientMock.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    rpc,
  });
  return { rpc };
}

function buildAdminClient(visibility: "public" | "admin_only") {
  const rpc = jest.fn().mockResolvedValue({
    data: null,
    error: { message: "stop at reserve" },
  });
  const categoryQuery = {
    eq: jest.fn(() => categoryQuery),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        visibility,
        collection_display_starts_at: null,
        collection_display_ends_at: null,
      },
      error: null,
    }),
  };
  const from = jest.fn((table: string) => {
    if (table !== "preset_categories") {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      select: jest.fn(() => categoryQuery),
    };
  });
  createAdminClientMock.mockReturnValue({ from, rpc });
  return { rpc };
}

describe("POST /api/collections/mount reserve RPC selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isCollectionDisplayPeriodActiveMock.mockReturnValue(true);
  });

  test("公開コレクションは session RPC に p_allow_admin_only=false で予約する", async () => {
    const session = buildSessionClient();
    const admin = buildAdminClient("public");
    isAdminViewerMock.mockReturnValue(false);

    const response = await POST(buildRequest({ categoryKey: "public_series" }));
    const body = (await response.json()) as { errorCode?: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("RESERVE_FAILED");
    expect(session.rpc).toHaveBeenCalledWith("reserve_collection_completion", {
      p_category_key: "public_series",
      p_allow_admin_only: false,
    });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test("admin_only コレクションは検証済みユーザーIDを service_role RPC に渡して予約する", async () => {
    const session = buildSessionClient();
    const admin = buildAdminClient("admin_only");
    isAdminViewerMock.mockReturnValue(true);

    const response = await POST(buildRequest({ categoryKey: "preview_series" }));
    const body = (await response.json()) as { errorCode?: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("RESERVE_FAILED");
    expect(admin.rpc).toHaveBeenCalledWith("reserve_collection_completion_for_user", {
      p_user_id: USER_ID,
      p_category_key: "preview_series",
      p_allow_admin_only: true,
    });
    expect(session.rpc).not.toHaveBeenCalled();
  });

  test("非 admin viewer は admin_only コレクションを予約前に404で隠す", async () => {
    const session = buildSessionClient();
    const admin = buildAdminClient("admin_only");
    isAdminViewerMock.mockReturnValue(false);

    const response = await POST(buildRequest({ categoryKey: "preview_series" }));
    const body = (await response.json()) as { errorCode?: string };

    expect(response.status).toBe(404);
    expect(body.errorCode).toBe("CATEGORY_NOT_FOUND");
    expect(session.rpc).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
