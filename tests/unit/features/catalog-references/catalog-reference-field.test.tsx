/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「見本(参照画像)」の欄(CatalogReferenceField)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 使ってはいけない画像を選ばないことへの同意にチェックするまで、見本を選べない
 *  - 選んだら見本用に縮めてから、縮めた画像を同意つきで POST /api/catalog-references に上げ、
 *    返った id と最初のまねるもの(衣装)を渡す
 *  - 上げている間は、そのことを親に知らせる(生成させない)
 *  - 上げられなければ、言語ごとの文言で理由を出して何も渡さない(手元で断った・API が断った・通信が切れた)
 *  - HEIC は受け付けない(ブラウザで読めない)。見本を選んだら、確認の帯と、まねないものを出す
 *  - まねるものは決まった順で持ち、0個なら選ぶように出す。外すと null を渡す
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const PREPARED = new File(["prepared"], "ref.jpg", { type: "image/jpeg" });
const mockPrepare = jest.fn<Promise<File>, [File]>(async () => PREPARED);
jest.mock("@/features/catalog-references/lib/prepare-reference-image", () => ({
  ...jest.requireActual("@/features/catalog-references/lib/prepare-reference-image"),
  prepareCatalogReferenceImage: (file: File) => mockPrepare(file),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CatalogReferenceField,
  type CatalogReferenceValue,
} from "@/features/catalog-references/components/CatalogReferenceField";
import { ReferenceImageError } from "@/features/catalog-references/lib/prepare-reference-image";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockPrepare.mockReset();
  mockPrepare.mockImplementation(async () => PREPARED);
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
});

function pickFile() {
  const file = new File(["x"], "ref.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("catalog-reference-file"), { target: { files: [file] } });
  return file;
}

function chooseButton() {
  return screen.getByRole("button", { name: /catalogReferenceChoose|catalogReferenceUploading/ }) as HTMLButtonElement;
}

test("同意にチェックするまで、見本を選べない", () => {
  render(<CatalogReferenceField value={null} onChange={jest.fn()} />);

  expect(chooseButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));
  expect(chooseButton().disabled).toBe(false);
});

test("選んだら見本用に縮め、縮めた画像を同意つきで上げ、返った id と最初のまねるもの(衣装)を渡す", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "ref-1" }) });
  const onChange = jest.fn();
  const onUploadingChange = jest.fn();
  render(<CatalogReferenceField value={null} onChange={onChange} onUploadingChange={onUploadingChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  const file = pickFile();

  await waitFor(() => expect(onChange).toHaveBeenCalled());
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

test.each([
  ["読めない画像", "load_failed", "catalogReferenceInvalid"],
  ["小さすぎる", "too_small", "catalogReferenceTooSmall"],
  ["大きすぎる・細長すぎる", "too_large", "catalogReferenceTooLarge"],
] as const)("手元で断ったら(%s)、上げずに言語ごとの文言を出す", async (_label, problem, key) => {
  mockPrepare.mockRejectedValue(new ReferenceImageError(problem));
  const onChange = jest.fn();
  const onUploadingChange = jest.fn();
  render(<CatalogReferenceField value={null} onChange={onChange} onUploadingChange={onUploadingChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", key);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
});

test.each([
  ["小さすぎる", "CATALOG_REFERENCE_IMAGE_TOO_SMALL", "catalogReferenceTooSmall"],
  ["使えない形式", "CATALOG_REFERENCE_IMAGE_INVALID", "catalogReferenceInvalid"],
  ["大きすぎる", "CATALOG_REFERENCE_FILE_TOO_LARGE", "catalogReferenceTooLarge"],
  ["そのほか", "CATALOG_REFERENCE_SAVE_FAILED", "catalogReferenceUploadFailed"],
])("API が断ったら(%s)、API の日本語ではなく言語ごとの文言を出し、何も渡さない", async (_label, errorCode, key) => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "日本語の理由", errorCode }) });
  const onChange = jest.fn();
  render(<CatalogReferenceField value={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", key);
  expect(onChange).not.toHaveBeenCalled();
});

test("通信が切れたら、決まった文言を出す", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<CatalogReferenceField value={null} onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "catalogReferenceUploadFailed");
});

test("HEIC は受け付けない(ブラウザで読めない)", () => {
  render(<CatalogReferenceField value={null} onChange={jest.fn()} />);

  const accept = screen.getByTestId("catalog-reference-file").getAttribute("accept") ?? "";
  expect(accept.split(",")).toEqual(["image/jpeg", "image/png", "image/webp"]);
});

describe("見本を選んだあと", () => {
  const value: CatalogReferenceValue = { id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] };

  test("確認の帯と、まねないものを出す(選ぶ前は出さない)", () => {
    const { rerender } = render(<CatalogReferenceField value={null} onChange={jest.fn()} />);
    expect(screen.queryByTestId("catalog-reference-review-banner")).toBeNull();

    rerender(<CatalogReferenceField value={value} onChange={jest.fn()} />);
    expect(screen.getByTestId("catalog-reference-review-banner").textContent).toBe("catalogReferenceReviewBanner");
    expect(screen.getByText("catalogReferenceNotTaken")).toBeTruthy();
  });

  test("まねるものは決まった順(衣装・アングル・ポーズ・背景)で持つ", () => {
    const onChange = jest.fn();
    render(<CatalogReferenceField value={{ ...value, takes: ["background"] }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakePose" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakeOutfit" }));

    expect(onChange).toHaveBeenNthCalledWith(1, { ...value, takes: ["pose", "background"] });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...value, takes: ["outfit", "background"] });
  });

  test("最後の1つを外すと空にし、0個なら選ぶように出す", () => {
    const onChange = jest.fn();
    const { rerender } = render(<CatalogReferenceField value={value} onChange={onChange} />);
    expect(screen.queryByText("catalogReferenceTakesRequired")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakeOutfit" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, takes: [] });

    rerender(<CatalogReferenceField value={{ ...value, takes: [] }} onChange={onChange} />);
    expect(screen.getByText("catalogReferenceTakesRequired")).toBeTruthy();
  });

  test("外すと null を渡し、プレビューの URL を放す", () => {
    const onChange = jest.fn();
    const { rerender } = render(<CatalogReferenceField value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "catalogReferenceRemove" }));
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<CatalogReferenceField value={null} onChange={onChange} />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
