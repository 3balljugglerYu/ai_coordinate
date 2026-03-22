/** @jest-environment node */

import { NextRequest } from "next/server";
import {
  enforceStyleBasicAuth,
  getStyleBasicAuthConfig,
  isStylePath,
} from "@/lib/style-basic-auth";

function createRequest(pathname: string, authHeader?: string): NextRequest {
  const headers = new Headers();

  if (authHeader) {
    headers.set("authorization", authHeader);
  }

  return new NextRequest(`http://localhost${pathname}`, { headers });
}

describe("style-basic-auth", () => {
  const originalUser = process.env.SHARED_BASIC_AUTH_USER;
  const originalPassword = process.env.SHARED_BASIC_AUTH_PASSWORD;

  beforeEach(() => {
    process.env.SHARED_BASIC_AUTH_USER = "persta_poc_user";
    process.env.SHARED_BASIC_AUTH_PASSWORD = "very-secret";
  });

  afterAll(() => {
    process.env.SHARED_BASIC_AUTH_USER = originalUser;
    process.env.SHARED_BASIC_AUTH_PASSWORD = originalPassword;
  });

  test("isStylePath_ページと関連API配下のみ一致する", () => {
    expect(isStylePath("/style")).toBe(true);
    expect(isStylePath("/style/generate")).toBe(true);
    expect(isStylePath("/style/events")).toBe(true);
    expect(isStylePath("/style/rate-limit-status")).toBe(true);
    expect(isStylePath("/style-guide")).toBe(false);
    expect(isStylePath("/i2i/test")).toBe(false);
  });

  test("getStyleBasicAuthConfig_共通資格情報を返す", () => {
    expect(getStyleBasicAuthConfig()).toEqual({
      basicUser: "persta_poc_user",
      basicPassword: "very-secret",
    });
  });

  test("enforceStyleBasicAuth_未認証なら401 challengeを返す", () => {
    const response = enforceStyleBasicAuth(createRequest("/style"));

    expect(response?.status).toBe(401);
    expect(response?.headers.get("www-authenticate")).toContain("Basic realm=");
  });

  test("enforceStyleBasicAuth_資格情報未設定なら404を返す", () => {
    process.env.SHARED_BASIC_AUTH_USER = "";
    process.env.SHARED_BASIC_AUTH_PASSWORD = "";

    const response = enforceStyleBasicAuth(createRequest("/style"));

    expect(response?.status).toBe(404);
  });

  test("enforceStyleBasicAuth_正しいBasic認証なら通過する", () => {
    const encoded = Buffer.from("persta_poc_user:very-secret").toString(
      "base64"
    );

    const response = enforceStyleBasicAuth(
      createRequest("/style", `Basic ${encoded}`)
    );

    expect(response).toBeNull();
  });
});
