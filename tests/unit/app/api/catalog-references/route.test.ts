/** @jest-environment node */

/**
 * POST /api/catalog-references(見本＝参照画像を上げる)。
 *
 * ここで守ること(計画書 REQ-001・REQ-002・ADR-002):
 *  - よそのサイトからは止める。ログインしていなければ 401、見本を使える人でなければ 403
 *  - 画像が無い・4MB を超える・形式が違う・小さすぎる・大きすぎるは断る
 *  - 画像は作り直した WebP を、ログイン中の本人の見本として、同意の時刻つきで保存する
 *  - 同意は、サーバーに残した本人の有効な同意を見る。無い・作り直しで無効になったら 400(重い画像の作り直しより先に断る)。
 *    見本の行には、その同意の時刻を写す(画面で同意を取っていない時刻を残さない)。確かめられなければ記録して 500
 *  - 返すのは id だけ(場所は返さない)。保存に失敗したら 500
 */

jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/auth/i2i-catalog", () => ({ isInI2iCatalogAllowlist: jest.fn() }));
jest.mock("@/lib/security/same-origin", () => ({ ensureSameOrigin: jest.fn(() => null) }));
jest.mock("@/features/inspire/lib/creator-looks-image", () => ({ processSubmissionImage: jest.fn() }));
jest.mock("@/features/catalog-references/lib/reference-image-repository", () => ({
  saveCatalogReferenceImage: jest.fn(),
}));
jest.mock("@/features/catalog-references/lib/consent-repository", () => ({
  getCatalogReferenceConsentState: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/catalog-references/route";
import { getUser } from "@/lib/auth";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { processSubmissionImage } from "@/features/inspire/lib/creator-looks-image";
import { saveCatalogReferenceImage } from "@/features/catalog-references/lib/reference-image-repository";
import { getCatalogReferenceConsentState } from "@/features/catalog-references/lib/consent-repository";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAllowlist = isInI2iCatalogAllowlist as jest.MockedFunction<typeof isInI2iCatalogAllowlist>;
const mockSameOrigin = ensureSameOrigin as jest.MockedFunction<typeof ensureSameOrigin>;
const mockProcess = processSubmissionImage as jest.MockedFunction<typeof processSubmissionImage>;
const mockSave = saveCatalogReferenceImage as jest.MockedFunction<typeof saveCatalogReferenceImage>;
const mockConsentState = getCatalogReferenceConsentState as jest.MockedFunction<
  typeof getCatalogReferenceConsentState
>;
const CONSENTED_AT = new Date("2026-10-31T01:00:00.000Z");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WEBP = Buffer.from("webp");

function request(fields: { file?: File | null }): NextRequest {
  const form = new FormData();
  if (fields.file !== null) form.set("file", fields.file ?? new File([new Uint8Array(16)], "ref.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/catalog-references", { method: "POST", body: form });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSameOrigin.mockReturnValue(null);
  mockGetUser.mockResolvedValue({ id: USER_ID } as Awaited<ReturnType<typeof getUser>>);
  mockAllowlist.mockResolvedValue(true);
  mockProcess.mockResolvedValue({
    ok: true,
    data: { webpBuffer: WEBP, width: 1024, height: 1024, originalFormat: "png" },
  });
  mockSave.mockResolvedValue({ id: "ref-1" });
  mockConsentState.mockResolvedValue({ consentedAt: CONSENTED_AT, consentedBefore: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("見本を使える人が同意つきで上げると、作り直した WebP を本人の見本として、同意の時刻つきで保存し、id だけを返す", async () => {
  const response = await POST(request({}));

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ id: "ref-1" });
  expect(mockConsentState).toHaveBeenCalledWith(USER_ID);
  expect(mockSave).toHaveBeenCalledWith({ userId: USER_ID, webpBuffer: WEBP, consentedAt: CONSENTED_AT });
});

test("よそのサイトからは、ログインの確認より前に止める", async () => {
  mockSameOrigin.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

  const response = await POST(request({}));

  expect(response.status).toBe(403);
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});

test.each([
  ["ログインしていない", () => mockGetUser.mockResolvedValue(null), 401, "CATALOG_REFERENCE_AUTH_REQUIRED"],
  ["見本を使える人でない", () => mockAllowlist.mockResolvedValue(false), 403, "CATALOG_REFERENCE_NOT_ALLOWED"],
])("%s → %p で保存しない", async (_label, arrange, status, errorCode) => {
  arrange();

  const response = await POST(request({}));

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
  expect(mockSave).not.toHaveBeenCalled();
});

test.each([
  ["画像が無い", { file: null }, 400, "CATALOG_REFERENCE_FILE_REQUIRED"],
  [
    "4MB を超える",
    { file: new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }) },
    413,
    "CATALOG_REFERENCE_FILE_TOO_LARGE",
  ],
])("%s → %p で保存しない", async (_label, fields, status, errorCode) => {
  const response = await POST(request(fields as { file?: File | null }));

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
  expect(mockSave).not.toHaveBeenCalled();
});

test.each([
  ["形式が違う", "FORMAT_NOT_SUPPORTED", "CATALOG_REFERENCE_IMAGE_INVALID"],
  ["小さすぎる", "DIMENSION_TOO_SMALL", "CATALOG_REFERENCE_IMAGE_TOO_SMALL"],
  ["大きすぎる", "DIMENSION_TOO_LARGE", "CATALOG_REFERENCE_IMAGE_TOO_LARGE"],
  ["作り直しに失敗", "RE_ENCODE_FAILED", "CATALOG_REFERENCE_IMAGE_INVALID"],
] as const)("画像の中身を確かめて%s → 400 で保存しない", async (_label, code, errorCode) => {
  mockProcess.mockResolvedValue({ ok: false, error: { code, message: "x" } });

  const response = await POST(request({}));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ errorCode });
  expect(mockSave).not.toHaveBeenCalled();
});

test("保存に失敗したら 500", async () => {
  mockSave.mockRejectedValue(new Error("boom"));
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await POST(request({}));

  expect(response.status).toBe(500);
});

describe("サーバーに残した同意", () => {
  test.each([
    ["同意したことが無い", { consentedAt: null, consentedBefore: false }],
    ["作り直しで同意が無効になった", { consentedAt: null, consentedBefore: true }],
  ])("%s ときは、画像を作り直さず、保存せずに 400", async (_label, state) => {
    mockConsentState.mockResolvedValue(state);

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: "CATALOG_REFERENCE_CONSENT_REQUIRED" });
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("同意を確かめられなければ、記録して、保存せずに 500(保存の失敗とは分ける)", async () => {
    const cause = new Error("見本の同意の確認に失敗しました");
    mockConsentState.mockRejectedValue(cause);
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request({}));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ errorCode: "CATALOG_REFERENCE_CONSENT_CHECK_FAILED" });
    expect(logged).toHaveBeenCalledWith(expect.any(String), cause);
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
