/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の画像の欄を「うちの子」と「見本」の2枚並べにする部品(CatalogReferencePicker)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10(第2案)
 *
 * ここで守ること:
 *  - うちの子の欄と見本の欄を並べて出す
 *  - 有効な同意がサーバーに無い人は、選んだ直後に「使える見本・使えない見本」を出し、
 *    「わかりました」で同意をサーバーに残してから上げる(閉じたら上げない。残せなければ上げない)
 *  - 有効な同意がある人(あとから変わった値も含む)は、選んだらすぐ上げる
 *  - 「次からは出ません」は、一度も同意したことが無い人の初めての同意のときだけ出す
 *  - 同意を残すのを断られたら、理由ごとの文言を出す(ログインが切れた・一覧から外れた・そのほか)
 *  - 見本を上げる API が「同意が要る」と断ったら、わけを出し、縮めた画像を持ったまま同意の画面を出し、同意したら
 *    縮め直さずに上げ直す
 *  - 上げるときは見本用に縮めてから、縮めた画像を POST /api/catalog-references に上げ、
 *    返った id と最初のまねるもの(衣装)を渡す。上げている間は、そのことを親に知らせる
 *  - 上げられなければ、言語ごとの文言で理由を出して何も渡さない(手元で断った・API が断った・通信が切れた)
 *  - HEIC は受け付けない。外すと null を渡す(プレビューの URL を放すのは、値を持つ親)
 *  - 「使える見本・使えない見本」は、あとから見返せる(見返しても上げない・同意にもしない)
 */

// 文言はキーのまま返す。差し込む値(小さすぎるときの下限)は「キー:値」にして、渡っていることを確かめる
jest.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: { min?: number }) => (values?.min !== undefined ? `${key}:${values.min}` : key),
      { rich: (key: string) => key },
    ),
  useLocale: () => "ja",
}));

const PREPARED = new File(["prepared"], "ref.jpg", { type: "image/jpeg" });
const mockPrepare = jest.fn<Promise<File>, [File]>(async () => PREPARED);
jest.mock("@/features/catalog-references/lib/prepare-reference-image", () => ({
  ...jest.requireActual("@/features/catalog-references/lib/prepare-reference-image"),
  prepareCatalogReferenceImage: (file: File) => mockPrepare(file),
}));

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CatalogReferencePicker } from "@/features/catalog-references/components/CatalogReferencePicker";
import type { CatalogReferenceValue } from "@/features/catalog-references/types";
import { ReferenceImageError } from "@/features/catalog-references/lib/prepare-reference-image";

const CONSENT_URL = "/api/catalog-references/consent";
const UPLOAD_URL = "/api/catalog-references";

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };
let consentResponse: () => Promise<FakeResponse>;
let uploadResponse: () => Promise<FakeResponse>;

function respond(ok: boolean, body: unknown): () => Promise<FakeResponse> {
  return async () => ({ ok, json: async () => body });
}

function callsTo(url: string) {
  return fetchMock.mock.calls.filter(([calledUrl]) => calledUrl === url) as Array<[string, RequestInit]>;
}

afterEach(() => {
  global.fetch = originalFetch;
  for (const [name, descriptor] of [
    ["createObjectURL", originalCreateObjectURL],
    ["revokeObjectURL", originalRevokeObjectURL],
  ] as const) {
    if (descriptor) Object.defineProperty(URL, name, descriptor);
    else delete (URL as unknown as Record<string, unknown>)[name];
  }
  window.localStorage.clear();
});

beforeEach(() => {
  fetchMock.mockReset();
  consentResponse = respond(true, { consentedAt: "2026-10-31T01:00:00.000Z" });
  uploadResponse = respond(true, { id: "ref-1" });
  fetchMock.mockImplementation((url: string) => (url === CONSENT_URL ? consentResponse() : uploadResponse()));
  mockPrepare.mockReset();
  mockPrepare.mockImplementation(async () => PREPARED);
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
});

type PickerProps = React.ComponentProps<typeof CatalogReferencePicker>;

function renderPicker(props: Partial<PickerProps> = {}) {
  const merged: PickerProps = {
    ownImage: <div data-testid="own-image" />,
    value: null,
    onChange: jest.fn(),
    consented: true,
    consentedBefore: true,
    ...props,
  };
  const utils = render(<CatalogReferencePicker {...merged} />);
  return { ...utils, props: merged };
}

function pickFile() {
  const file = new File(["x"], "ref.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("catalog-reference-file"), { target: { files: [file] } });
  return file;
}

function agree() {
  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentAgree" }));
}

const consentSheet = () => screen.queryByTestId("catalog-reference-consent-sheet");

test("うちの子の欄と、見本の欄を並べて出す", () => {
  renderPicker();

  expect(screen.getByTestId("own-image")).toBeTruthy();
  expect(screen.getByRole("button", { name: "catalogReferenceChoose" })).toBeTruthy();
  expect(screen.getByText("catalogReferenceOwnImageCaption")).toBeTruthy();
  expect(screen.getByText("catalogReferenceImageCaption")).toBeTruthy();
});

// 一度も同意したことが無い人
const FIRST_TIME = { consented: false, consentedBefore: false } as const;

describe("同意(有効な同意がサーバーに無い人)", () => {
  test("選んだ直後に「使える見本・使えない見本」を出し、まだ何も送らない", () => {
    renderPicker(FIRST_TIME);

    pickFile();

    expect(consentSheet()).toBeTruthy();
    expect(screen.getByText("catalogReferenceConsentOnce", { exact: false })).toBeTruthy();
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("「わかりました」で同意をサーバーに残してから、縮めた画像を上げ、返った id と最初のまねるもの(衣装)を渡す", async () => {
    const onChange = jest.fn();
    const onUploadingChange = jest.fn();
    renderPicker({ ...FIRST_TIME, onChange, onUploadingChange });
    const file = pickFile();

    agree();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await waitFor(() => expect(consentSheet()).toBeNull());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([CONSENT_URL, UPLOAD_URL]);
    expect(callsTo(CONSENT_URL)[0][1].method).toBe("POST");
    expect(mockPrepare).toHaveBeenCalledWith(file);
    const [, init] = callsTo(UPLOAD_URL)[0];
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    // 同意はサーバーに残したものを見るので、決まった値は送らない
    expect(form.get("copyrightConsent")).toBeNull();
    // 元の画像ではなく、縮めた画像を送り、プレビューにも使う
    expect(form.get("file")).toBe(PREPARED);
    expect(URL.createObjectURL).toHaveBeenCalledWith(PREPARED);
    expect(onChange).toHaveBeenCalledWith({ id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] });
    // 同意を残す間も上げる間も、続けて「上げている」
    expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
  });

  test.each([
    ["ログインが切れた", "CATALOG_REFERENCE_AUTH_REQUIRED", "catalogReferenceAuthRequired"],
    ["一覧から外れた", "CATALOG_REFERENCE_NOT_ALLOWED", "catalogReferenceNotAllowed"],
  ])("同意を残すのを断られたら(%s)、その理由を出して上げない", async (_label, errorCode, key) => {
    consentResponse = respond(false, { errorCode });
    renderPicker(FIRST_TIME);
    pickFile();

    agree();

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", key);
    expect(callsTo(UPLOAD_URL)).toHaveLength(0);
  });

  test("同意をサーバーに残せなければ上げず、次に選んだときにまた同意の画面を出す", async () => {
    consentResponse = respond(false, { errorCode: "CATALOG_REFERENCE_CONSENT_SAVE_FAILED" });
    const onChange = jest.fn();
    renderPicker({ ...FIRST_TIME, onChange });
    pickFile();

    agree();

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "catalogReferenceConsentFailed");
    expect(callsTo(UPLOAD_URL)).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(consentSheet()).toBeNull());

    pickFile();
    expect(consentSheet()).toBeTruthy();
  });

  test("同意せずに閉じたら(閉じるボタン)、何も送らない。もう一度選ぶと、また出す", async () => {
    renderPicker(FIRST_TIME);
    pickFile();

    fireEvent.click(screen.getByRole("button", { name: "catalogReferenceSheetClose" }));
    await waitFor(() => expect(consentSheet()).toBeNull());
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    pickFile();
    expect(consentSheet()).toBeTruthy();
  });

  test("一度同意したら、この画面では次に選んだときに出さずに上げる", async () => {
    const onChange = jest.fn();
    renderPicker({ ...FIRST_TIME, onChange });
    pickFile();
    agree();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consentSheet()).toBeNull());

    pickFile();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(consentSheet()).toBeNull();
    expect(callsTo(CONSENT_URL)).toHaveLength(1);
    expect(callsTo(UPLOAD_URL)).toHaveLength(2);
  });

  test("サーバーの値があとから「同意あり」に変わったら、それに合わせて出さない", async () => {
    const onChange = jest.fn();
    const { rerender, props } = renderPicker({ ...FIRST_TIME, onChange });

    rerender(<CatalogReferencePicker {...props} consented />);
    pickFile();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(consentSheet()).toBeNull();
    expect(callsTo(CONSENT_URL)).toHaveLength(0);
  });
});

test("有効な同意がある人は、選んだらすぐ上げる(同意の画面を出さず、同意も送らない)", async () => {
  const onChange = jest.fn();
  renderPicker({ consented: true, onChange });

  pickFile();

  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(consentSheet()).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([UPLOAD_URL]);
});

test("見本を上げる API が「同意が要る」と断ったら(開いたあとに作り直しになったなど)、選んだ画像を持ったまま同意の画面を出し、同意したら上げ直す", async () => {
  const responses = [
    respond(false, { errorCode: "CATALOG_REFERENCE_CONSENT_REQUIRED" }),
    respond(true, { id: "ref-2" }),
  ];
  uploadResponse = () => responses.shift()!();
  const onChange = jest.fn();
  renderPicker({ consented: true, consentedBefore: true, onChange });
  const file = pickFile();

  await waitFor(() => expect(consentSheet()).toBeTruthy());
  expect(onChange).not.toHaveBeenCalled();
  // わけは同意の画面の中に出す
  expect(within(consentSheet()!).getByRole("status").textContent).toBe("catalogReferenceConsentRequired");
  // 同意し直しなので「次からは出ません」は出さない
  expect(screen.queryByText("catalogReferenceConsentOnce", { exact: false })).toBeNull();

  agree();

  await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: "ref-2", previewUrl: "blob:preview", takes: ["outfit"] }));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([UPLOAD_URL, CONSENT_URL, UPLOAD_URL]);
  // 縮めるのは最初の1回だけ。上げ直すのは縮めた画像
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(mockPrepare).toHaveBeenCalledWith(file);
  expect((callsTo(UPLOAD_URL)[1][1].body as FormData).get("file")).toBe(PREPARED);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("隠している間(「プロンプトから」)に同意し直しが要ると分かったら、同意の画面は見せたときに出す", async () => {
  uploadResponse = respond(false, { errorCode: "CATALOG_REFERENCE_CONSENT_REQUIRED" });
  const { rerender, props } = renderPicker({ consented: true, consentedBefore: true });
  pickFile();
  // 上げている途中で「プロンプトから」へ移った
  rerender(<CatalogReferencePicker {...props} active={false} />);
  await waitFor(() => expect(callsTo(UPLOAD_URL)).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(consentSheet()).toBeNull();

  rerender(<CatalogReferencePicker {...props} active />);
  await waitFor(() => expect(consentSheet()).toBeTruthy());
});

test("作り直しで同意が無効になった人(一度は同意している)には、同意の画面を出すが「次からは出ません」は出さない", () => {
  renderPicker({ consented: false, consentedBefore: true });

  pickFile();

  expect(consentSheet()).toBeTruthy();
  expect(screen.queryByText("catalogReferenceConsentOnce", { exact: false })).toBeNull();
});

test.each([
  ["読めない画像", "load_failed", "catalogReferenceInvalid"],
  ["小さすぎる", "too_small", "catalogReferenceTooSmall:768"],
  ["大きすぎる・細長すぎる", "too_large", "catalogReferenceTooLarge"],
] as const)("手元で断ったら(%s)、上げずに言語ごとの文言を出す", async (_label, problem, key) => {
  mockPrepare.mockRejectedValue(new ReferenceImageError(problem));
  const onChange = jest.fn();
  const onUploadingChange = jest.fn();
  renderPicker({ onChange, onUploadingChange });

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", key);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
});

test.each([
  ["小さすぎる", "CATALOG_REFERENCE_IMAGE_TOO_SMALL", "catalogReferenceTooSmall:768"],
  ["ログインが切れた", "CATALOG_REFERENCE_AUTH_REQUIRED", "catalogReferenceAuthRequired"],
  ["一覧から外れた", "CATALOG_REFERENCE_NOT_ALLOWED", "catalogReferenceNotAllowed"],
  ["使えない形式", "CATALOG_REFERENCE_IMAGE_INVALID", "catalogReferenceInvalid"],
  ["大きすぎる", "CATALOG_REFERENCE_FILE_TOO_LARGE", "catalogReferenceTooLarge"],
  ["同意を確かめられない", "CATALOG_REFERENCE_CONSENT_CHECK_FAILED", "catalogReferenceUploadFailed"],
  ["そのほか", "CATALOG_REFERENCE_SAVE_FAILED", "catalogReferenceUploadFailed"],
])("API が断ったら(%s)、API の日本語ではなく言語ごとの文言を出し、何も渡さない", async (_label, errorCode, key) => {
  uploadResponse = respond(false, { error: "日本語の理由", errorCode });
  const onChange = jest.fn();
  renderPicker({ onChange });

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", key);
  expect(onChange).not.toHaveBeenCalled();
});

test("通信が切れたら、決まった文言を出す", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  renderPicker();

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "catalogReferenceUploadFailed");
});

test("HEIC は受け付けない(ブラウザで読めない)", () => {
  renderPicker();

  const accept = screen.getByTestId("catalog-reference-file").getAttribute("accept") ?? "";
  expect(accept.split(",")).toEqual(["image/jpeg", "image/png", "image/webp"]);
});

test("外すと null を渡す。プレビューの URL は放さない(値を持つ親が放す。組み直しで壊さない)", () => {
  const value: CatalogReferenceValue = { id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] };
  const { rerender, props, unmount } = renderPicker({ value });

  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceRemove" }));
  expect(props.onChange).toHaveBeenCalledWith(null);

  rerender(<CatalogReferencePicker {...props} value={null} />);
  unmount();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

test("「使える見本・使えない見本」をあとから見返せる(見返しても上げない・「次からは出ません」は出さない)", async () => {
  renderPicker({ consented: true });

  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentTitle" }));
  expect(consentSheet()).toBeTruthy();
  expect(screen.queryByText("catalogReferenceConsentOnce", { exact: false })).toBeNull();

  agree();
  await waitFor(() => expect(consentSheet()).toBeNull());
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("同意の無い人が見返して「わかりました」を押しても、同意にはしない(選んだら同意の画面を出す)", async () => {
  renderPicker(FIRST_TIME);
  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentTitle" }));
  agree();
  await waitFor(() => expect(consentSheet()).toBeNull());
  expect(fetchMock).not.toHaveBeenCalled();

  pickFile();

  expect(consentSheet()).toBeTruthy();
  expect(screen.getByText("catalogReferenceConsentOnce", { exact: false })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});
