/** @jest-environment node */

/**
 * POST /api/catalog-references/consent(「使える見本・使えない見本」の同意を残す)。
 *
 * ここで守ること(計画書 §10):
 *  - よそのサイトからは止める。ログインしていなければ 401、見本を使える人でなければ 403(どちらも残さない)
 *  - ログイン中の本人の同意として残し、残した時刻を返す。残せなければ 500
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/auth/i2i-catalog", () => ({ isInI2iCatalogAllowlist: jest.fn() }));
jest.mock("@/lib/security/same-origin", () => ({ ensureSameOrigin: jest.fn(() => null) }));
jest.mock("@/features/catalog-references/lib/consent-repository", () => ({
  recordCatalogReferenceConsent: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/catalog-references/consent/route";
import { getUser } from "@/lib/auth";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { recordCatalogReferenceConsent } from "@/features/catalog-references/lib/consent-repository";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAllowlist = isInI2iCatalogAllowlist as jest.MockedFunction<typeof isInI2iCatalogAllowlist>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;
const mockRecord = recordCatalogReferenceConsent as jest.MockedFunction<typeof recordCatalogReferenceConsent>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONSENTED_AT = new Date("2026-10-31T01:00:00.000Z");

function request(): NextRequest {
  return new NextRequest("http://localhost/api/catalog-references/consent", { method: "POST" });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSameOrigin.mockReturnValue(null);
  mockGetUser.mockResolvedValue({ id: USER_ID } as Awaited<ReturnType<typeof getUser>>);
  mockAllowlist.mockResolvedValue(true);
  mockRecord.mockResolvedValue(CONSENTED_AT);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("見本を使える人の同意を、ログイン中の本人の同意として残し、時刻を返す", async () => {
  const response = await POST(request());

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ consentedAt: CONSENTED_AT.toISOString() });
  expect(mockAllowlist).toHaveBeenCalledWith(USER_ID);
  expect(mockRecord).toHaveBeenCalledWith(USER_ID);
});

test("よそのサイトからは、ログインの確認より前に止める", async () => {
  mockSameOrigin.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

  const response = await POST(request());

  expect(response.status).toBe(403);
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRecord).not.toHaveBeenCalled();
});

test.each([
  ["ログインしていない", () => mockGetUser.mockResolvedValue(null), 401, "CATALOG_REFERENCE_AUTH_REQUIRED"],
  ["見本を使える人でない", () => mockAllowlist.mockResolvedValue(false), 403, "CATALOG_REFERENCE_NOT_ALLOWED"],
] as const)("%s ときは残さない(%i)", async (_label, arrange, status, errorCode) => {
  arrange();

  const response = await POST(request());

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
  expect(mockRecord).not.toHaveBeenCalled();
});

test("残せなければ 500", async () => {
  mockRecord.mockRejectedValue(new Error("見本の同意を残せませんでした"));
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await POST(request());

  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toMatchObject({ errorCode: "CATALOG_REFERENCE_CONSENT_SAVE_FAILED" });
});
