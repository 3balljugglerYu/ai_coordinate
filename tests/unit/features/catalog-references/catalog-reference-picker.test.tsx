/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の画像の欄を「うちの子」と「見本」の2枚並べにする部品(CatalogReferencePicker)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10(第2案)
 *
 * ここで守ること:
 *  - うちの子の欄と見本の欄を並べて出す
 *  - 見本を前に上げたことが無い人は、選んだ直後に「使える見本・使えない見本」を出し、
 *    「わかりました」を押すまで上げない(閉じたら上げない)。一度同意したら次からは出さない
 *  - 前に上げたことがある人は、選んだらすぐ上げる
 *  - 上げるときは見本用に縮めてから、縮めた画像を同意つきで POST /api/catalog-references に上げ、
 *    返った id と最初のまねるもの(衣装)を渡す。上げている間は、そのことを親に知らせる
 *  - 上げられなければ、言語ごとの文言で理由を出して何も渡さない(手元で断った・API が断った・通信が切れた)
 *  - HEIC は受け付けない。外すと null を渡し、プレビューの URL を放す
 *  - 「使える見本・使えない見本」は、あとから見返せる(見返しても上げない)
 *  - 「先行公開」の案内は、前に上げたことが無く、まだ見ていない人にだけ1回出す
 */

// 文言はキーのまま返す。差し込む値(小さすぎるときの下限)は「キー:値」にして、渡っていることを確かめる
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { min?: number }) =>
    values?.min !== undefined ? `${key}:${values.min}` : key,
  useLocale: () => "ja",
}));

const PREPARED = new File(["prepared"], "ref.jpg", { type: "image/jpeg" });
const mockPrepare = jest.fn<Promise<File>, [File]>(async () => PREPARED);
jest.mock("@/features/catalog-references/lib/prepare-reference-image", () => ({
  ...jest.requireActual("@/features/catalog-references/lib/prepare-reference-image"),
  prepareCatalogReferenceImage: (file: File) => mockPrepare(file),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CatalogReferencePicker,
  type CatalogReferenceValue,
} from "@/features/catalog-references/components/CatalogReferencePicker";
import { ReferenceImageError } from "@/features/catalog-references/lib/prepare-reference-image";

const INTRO_SEEN_KEY = "persta:catalog-reference-intro-seen-v1";
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockPrepare.mockReset();
  mockPrepare.mockImplementation(async () => PREPARED);
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
  // 案内は見たことにしておく(案内のテストだけ消す)
  window.localStorage.clear();
  window.localStorage.setItem(INTRO_SEEN_KEY, "1");
});

type PickerProps = React.ComponentProps<typeof CatalogReferencePicker>;

function renderPicker(props: Partial<PickerProps> = {}) {
  const merged: PickerProps = {
    ownImage: <div data-testid="own-image" />,
    value: null,
    onChange: jest.fn(),
    consented: true,
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

function respondWithId(id = "ref-1") {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id }) });
}

test("うちの子の欄と、見本の欄を並べて出す", () => {
  renderPicker();

  expect(screen.getByTestId("own-image")).toBeTruthy();
  expect(screen.getByRole("button", { name: "catalogReferenceChoose" })).toBeTruthy();
  expect(screen.getByText("catalogReferenceOwnImageRequired")).toBeTruthy();
  expect(screen.getByText("catalogReferenceOptional")).toBeTruthy();
});

describe("初めての同意(前に見本を上げたことが無い人)", () => {
  test("選んだ直後に「使える見本・使えない見本」を出し、まだ上げない", () => {
    renderPicker({ consented: false });

    pickFile();

    expect(screen.getByTestId("catalog-reference-consent-sheet")).toBeTruthy();
    expect(screen.getByText("catalogReferenceConsentOnce", { exact: false })).toBeTruthy();
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("「わかりました」で、縮めた画像を同意つきで上げ、返った id と最初のまねるもの(衣装)を渡す", async () => {
    respondWithId();
    const onChange = jest.fn();
    const onUploadingChange = jest.fn();
    renderPicker({ consented: false, onChange, onUploadingChange });
    const file = pickFile();

    fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentAgree" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("catalog-reference-consent-sheet")).toBeNull());
    expect(mockPrepare).toHaveBeenCalledWith(file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/catalog-references");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("copyrightConsent")).toBe("true");
    // 元の画像ではなく、縮めた画像を送り、プレビューにも使う
    expect(form.get("file")).toBe(PREPARED);
    expect(URL.createObjectURL).toHaveBeenCalledWith(PREPARED);
    expect(onChange).toHaveBeenCalledWith({ id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] });
    expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
  });

  test("同意せずに閉じたら上げない。もう一度選ぶと、また出す", async () => {
    renderPicker({ consented: false });
    pickFile();

    fireEvent.keyDown(screen.getByTestId("catalog-reference-consent-sheet"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("catalog-reference-consent-sheet")).toBeNull());
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    pickFile();
    expect(screen.getByTestId("catalog-reference-consent-sheet")).toBeTruthy();
  });

  test("一度同意したら、次に選んだときは出さずに上げる", async () => {
    respondWithId();
    const onChange = jest.fn();
    renderPicker({ consented: false, onChange });
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentAgree" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("catalog-reference-consent-sheet")).toBeNull());

    pickFile();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("catalog-reference-consent-sheet")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

test("前に見本を上げたことがある人は、選んだらすぐ上げる(同意の画面を出さない)", async () => {
  respondWithId();
  const onChange = jest.fn();
  renderPicker({ consented: true, onChange });

  pickFile();

  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(screen.queryByTestId("catalog-reference-consent-sheet")).toBeNull();
  expect(((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData).get("copyrightConsent")).toBe(
    "true",
  );
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
  ["そのほか", "CATALOG_REFERENCE_SAVE_FAILED", "catalogReferenceUploadFailed"],
])("API が断ったら(%s)、API の日本語ではなく言語ごとの文言を出し、何も渡さない", async (_label, errorCode, key) => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "日本語の理由", errorCode }) });
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

test("外すと null を渡し、プレビューの URL を放す", () => {
  const value: CatalogReferenceValue = { id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] };
  const { rerender, props } = renderPicker({ value });

  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceRemove" }));
  expect(props.onChange).toHaveBeenCalledWith(null);

  rerender(<CatalogReferencePicker {...props} value={null} />);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

test("「使える見本・使えない見本」をあとから見返せる(見返しても上げない・「次からは出ません」は出さない)", async () => {
  renderPicker({ consented: true });

  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentReopen" }));
  expect(screen.getByTestId("catalog-reference-consent-sheet")).toBeTruthy();
  expect(screen.queryByText("catalogReferenceConsentOnce", { exact: false })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceConsentAgree" }));
  await waitFor(() => expect(screen.queryByTestId("catalog-reference-consent-sheet")).toBeNull());
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

describe("「先行公開」の案内", () => {
  beforeEach(() => {
    window.localStorage.removeItem(INTRO_SEEN_KEY);
  });

  test("前に見本を上げたことが無く、まだ見ていない人に出す。閉じたら印を残す", async () => {
    renderPicker({ consented: false });

    expect(screen.getByTestId("catalog-reference-intro-sheet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "catalogReferenceIntroTry" }));

    await waitFor(() => expect(screen.queryByTestId("catalog-reference-intro-sheet")).toBeNull());
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("1");
  });

  test("一度見た人には出さない", () => {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    renderPicker({ consented: false });

    expect(screen.queryByTestId("catalog-reference-intro-sheet")).toBeNull();
  });

  test("前に見本を上げたことがある人には出さない", () => {
    renderPicker({ consented: true });

    expect(screen.queryByTestId("catalog-reference-intro-sheet")).toBeNull();
  });
});
