/** @jest-environment node */

/**
 * 公開停止中コンテンツの再投稿がブロックされることの回帰テスト。
 *
 * 計画: docs/planning/post-moderation-notification-implementation-plan.md
 *       REQ-011 / REQ-013 の改訂
 *
 * 公開停止された投稿は `is_posted = false` に戻され、投稿者のギャラリーでは
 * 未投稿として普通に扱える（恒久バッジは離脱要因になるため付けない）。
 * その代償として「投稿者が公開停止された画像をそのまま再公開できる」穴が開く。
 *
 * 実際の強制は DB trigger `enforce_no_publish_while_removed` が行い、
 * クライアントのダイアログは UX でしかない。ここでは API がその例外を
 * 専用の errorCode に変換し、クライアントがコードで分岐できることを固定する。
 */

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/features/generation/lib/server-database", () => ({
  postImageServer: jest.fn(),
}));

jest.mock("@/features/generation/lib/webp-storage", () => ({
  ensureWebPVariants: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/api/route-locale", () => ({
  getRouteLocale: jest.fn(() => "ja"),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/post/route";
import { getUser } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { PostApiError } from "@/features/posts/lib/api";
import {
  POSTS_SUSPENDED_CANNOT_PUBLISH,
  isSuspendedPublishError,
} from "@/features/posts/lib/post-error-codes";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockPostImageServer = postImageServer as jest.MockedFunction<
  typeof postImageServer
>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";

function request(body: unknown) {
  return new NextRequest("https://example.com/api/posts/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/posts/post — 公開停止中コンテンツ", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: USER_ID } as never);
  });

  it("DB trigger の例外を 409 と専用 errorCode に変換する", async () => {
    // trigger が RAISE EXCEPTION 'post_suspended_cannot_publish' を出す状況
    mockPostImageServer.mockRejectedValue(
      new Error(
        '画像の投稿に失敗しました: post_suspended_cannot_publish'
      )
    );

    const response = await POST(request({ id: IMAGE_ID }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("POSTS_SUSPENDED_CANNOT_PUBLISH");
    // 文言はユーザー向けに整えたものを返す（生の例外メッセージを露出させない）
    expect(payload.error).not.toContain("post_suspended_cannot_publish");
  });

  it("それ以外の失敗は従来どおり 500 のまま", async () => {
    mockPostImageServer.mockRejectedValue(new Error("something else"));

    const response = await POST(request({ id: IMAGE_ID }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.errorCode).toBe("POSTS_POST_FAILED");
  });
});

describe("PostApiError", () => {
  it("errorCode を保持してクライアントがコードで分岐できる", () => {
    const error = new PostApiError("投稿できません", POSTS_SUSPENDED_CANNOT_PUBLISH);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("POSTS_SUSPENDED_CANNOT_PUBLISH");
    expect(error.message).toBe("投稿できません");
  });

  it("errorCode が無いレスポンスでは code が null になる", () => {
    const error = new PostApiError("投稿に失敗しました", null);
    expect(error.code).toBeNull();
  });
});

describe("isSuspendedPublishError", () => {
  /**
   * instanceof ではなく code の構造的チェックにしている。
   * api.ts を jest.mock するテストでは class が undefined になり
   * instanceof が TypeError を投げるため（既存の PostModal テストで発生した）。
   */
  it("code が一致すれば true", () => {
    expect(
      isSuspendedPublishError(
        new PostApiError("x", POSTS_SUSPENDED_CANNOT_PUBLISH)
      )
    ).toBe(true);
    // クラスのインスタンスでなくても、形が合っていれば判定できる
    expect(
      isSuspendedPublishError({ code: POSTS_SUSPENDED_CANNOT_PUBLISH })
    ).toBe(true);
  });

  it("別の code / code 無し / 非オブジェクトは false", () => {
    expect(isSuspendedPublishError(new PostApiError("x", "OTHER"))).toBe(false);
    expect(isSuspendedPublishError(new Error("plain"))).toBe(false);
    expect(isSuspendedPublishError({ code: undefined })).toBe(false);
    expect(isSuspendedPublishError(null)).toBe(false);
    expect(isSuspendedPublishError("string")).toBe(false);
  });
});
