/** @jest-environment node */

import { NextRequest, NextResponse } from "next/server";
import {
  ensureGuestIdOnResponse,
  GUEST_ID_COOKIE,
  GUEST_ID_COOKIE_MAX_AGE,
  isValidGuestId,
  readGuestIdCookie,
  shouldIssueGuestIdForPathname,
} from "@/lib/guest-id";

const VALID_UUID = "11111111-2222-4333-8444-555555555555";

function createRequest(
  options: { cookieValue?: string | null; pathname?: string } = {}
): NextRequest {
  const url = `http://localhost${options.pathname ?? "/"}`;
  const headers: Record<string, string> = {};
  if (options.cookieValue) {
    headers["cookie"] = `${GUEST_ID_COOKIE}=${options.cookieValue}`;
  }
  return new NextRequest(url, { headers });
}

describe("guest-id", () => {
  describe("isValidGuestId", () => {
    test("RFC 4122 形式の UUID を true で返す", () => {
      expect(isValidGuestId(VALID_UUID)).toBe(true);
      expect(isValidGuestId("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    });

    test("形式が違う / 空 / 非文字列は false", () => {
      expect(isValidGuestId("not-a-uuid")).toBe(false);
      expect(isValidGuestId("")).toBe(false);
      expect(isValidGuestId(null)).toBe(false);
      expect(isValidGuestId(undefined)).toBe(false);
      expect(isValidGuestId(12345)).toBe(false);
      // バージョンビット (3 文字目) が範囲外
      expect(isValidGuestId("11111111-2222-9333-8444-555555555555")).toBe(false);
      // バリアントビット (4 文字目) が範囲外
      expect(isValidGuestId("11111111-2222-4333-c444-555555555555")).toBe(false);
    });
  });

  describe("readGuestIdCookie", () => {
    test("妥当な UUID Cookie を返す", () => {
      const request = createRequest({ cookieValue: VALID_UUID });
      expect(readGuestIdCookie(request)).toBe(VALID_UUID);
    });

    test("Cookie が無ければ null", () => {
      const request = createRequest({ cookieValue: null });
      expect(readGuestIdCookie(request)).toBeNull();
    });

    test("Cookie 値が不正なら null（再発行を促す）", () => {
      const request = createRequest({ cookieValue: "garbage" });
      expect(readGuestIdCookie(request)).toBeNull();
    });
  });

  describe("ensureGuestIdOnResponse", () => {
    test("Cookie が無ければ新規発行して response にセットする", () => {
      const request = createRequest({ cookieValue: null });
      const response = NextResponse.next();
      const issued = ensureGuestIdOnResponse(request, response);

      expect(isValidGuestId(issued)).toBe(true);
      const setCookie = response.cookies.get(GUEST_ID_COOKIE);
      expect(setCookie?.value).toBe(issued);
      // セキュリティ属性
      expect(setCookie?.httpOnly).toBe(true);
      expect(setCookie?.sameSite).toBe("lax");
      expect(setCookie?.path).toBe("/");
      expect(setCookie?.maxAge).toBe(GUEST_ID_COOKIE_MAX_AGE);
    });

    test("妥当な Cookie がある場合は触らずそのまま返す", () => {
      const request = createRequest({ cookieValue: VALID_UUID });
      const response = NextResponse.next();
      const result = ensureGuestIdOnResponse(request, response);

      expect(result).toBe(VALID_UUID);
      // 既存 Cookie には触らない（response の cookies は空のまま）
      expect(response.cookies.get(GUEST_ID_COOKIE)).toBeUndefined();
    });

    test("不正な Cookie は再発行する（抜け道防止）", () => {
      const request = createRequest({ cookieValue: "tampered-value" });
      const response = NextResponse.next();
      const issued = ensureGuestIdOnResponse(request, response);

      expect(issued).not.toBe("tampered-value");
      expect(isValidGuestId(issued)).toBe(true);
      expect(response.cookies.get(GUEST_ID_COOKIE)?.value).toBe(issued);
    });
  });

  describe("shouldIssueGuestIdForPathname", () => {
    test("/style 配下では発行する", () => {
      expect(shouldIssueGuestIdForPathname("/style")).toBe(true);
      expect(shouldIssueGuestIdForPathname("/style/")).toBe(true);
      expect(shouldIssueGuestIdForPathname("/style/foo")).toBe(true);
    });

    test("/coordinate 配下では発行する", () => {
      expect(shouldIssueGuestIdForPathname("/coordinate")).toBe(true);
      expect(shouldIssueGuestIdForPathname("/coordinate/anything")).toBe(true);
    });

    test("ロケールプレフィックス付きでも発行する", () => {
      expect(shouldIssueGuestIdForPathname("/en/style")).toBe(true);
      expect(shouldIssueGuestIdForPathname("/ja/coordinate/foo")).toBe(true);
    });

    test("無関係なパスでは発行しない", () => {
      expect(shouldIssueGuestIdForPathname("/")).toBe(false);
      expect(shouldIssueGuestIdForPathname("/posts/123")).toBe(false);
      expect(shouldIssueGuestIdForPathname("/api/foo")).toBe(false);
      expect(shouldIssueGuestIdForPathname("/styles")).toBe(false); // 部分一致で誤発行しない
      expect(shouldIssueGuestIdForPathname("/coordinator")).toBe(false);
    });
  });
});
