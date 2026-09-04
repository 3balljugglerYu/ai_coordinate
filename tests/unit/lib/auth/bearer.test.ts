/** @jest-environment node */

import {
  decodeJwtExpiry,
  isJwtUnexpired,
  readBearerJwt,
  readBearerToken,
} from "@/lib/auth/bearer";

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(exp: number): string {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    sub: "user-1",
    exp,
  })}.signature`;
}

describe("readBearerToken", () => {
  test("Authorization ヘッダーが無ければ null", () => {
    expect(readBearerToken(new Headers())).toBeNull();
  });

  test("Bearer 以外のスキームは null", () => {
    expect(
      readBearerToken(new Headers({ authorization: "Basic abc" }))
    ).toBeNull();
  });

  test("スキームは大文字小文字を区別せず、前後の空白を落とす", () => {
    expect(
      readBearerToken(new Headers({ authorization: "  bearer   token-1  " }))
    ).toBe("token-1");
  });

  test("空のトークンは null", () => {
    expect(readBearerToken(new Headers({ authorization: "Bearer   " }))).toBeNull();
  });
});

describe("readBearerJwt", () => {
  test("JWT の形(3 区画)だけを返す", () => {
    const jwt = makeJwt(4102444800);
    expect(readBearerJwt(new Headers({ authorization: `Bearer ${jwt}` }))).toBe(jwt);
  });

  test("秘密鍵のような非 JWT は null(Cookie 経路へフォールバック)", () => {
    expect(
      readBearerJwt(new Headers({ authorization: "Bearer cron-secret-value" }))
    ).toBeNull();
    expect(
      readBearerJwt(new Headers({ authorization: "Bearer a.b" }))
    ).toBeNull();
  });
});

describe("decodeJwtExpiry / isJwtUnexpired", () => {
  test("exp を読む", () => {
    expect(decodeJwtExpiry(makeJwt(1234567890))).toBe(1234567890);
  });

  test("壊れたトークンは null で、未有効扱い", () => {
    expect(decodeJwtExpiry("not-a-jwt")).toBeNull();
    expect(decodeJwtExpiry("a.!!!.c")).toBeNull();
    expect(isJwtUnexpired("a.b.c")).toBe(false);
  });

  test("期限判定", () => {
    const now = 1_700_000_000;
    expect(isJwtUnexpired(makeJwt(now + 60), now)).toBe(true);
    expect(isJwtUnexpired(makeJwt(now - 1), now)).toBe(false);
    expect(isJwtUnexpired(makeJwt(now), now)).toBe(false);
  });
});
