/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「見本(参照画像)」の欄(CatalogReferenceField)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 使ってはいけない画像を選ばないことへの同意にチェックするまで、見本を選べない
 *  - 選んだら縮めてから、同意つきで POST /api/catalog-references に上げ、返った id と最初のまねるもの(衣装)を渡す
 *  - 上げている間は、そのことを親に知らせる(生成させない)
 *  - 上げられなければ、API の理由を出して何も渡さない
 *  - まねるものは決まった順で持ち、0個なら選ぶように出す。外すと null を渡す
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockNormalize = jest.fn(async (file: File) => file);
jest.mock("@/features/generation/lib/normalize-source-image", () => ({
  normalizeSourceImage: (file: File) => mockNormalize(file),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CatalogReferenceField,
  type CatalogReferenceValue,
} from "@/features/catalog-references/components/CatalogReferenceField";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockNormalize.mockClear();
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

test("選んだら縮めてから同意つきで上げ、返った id と最初のまねるもの(衣装)を渡す", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "ref-1" }) });
  const onChange = jest.fn();
  const onUploadingChange = jest.fn();
  render(<CatalogReferenceField value={null} onChange={onChange} onUploadingChange={onUploadingChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  const file = pickFile();

  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(mockNormalize).toHaveBeenCalledWith(file);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/catalog-references");
  expect(init.method).toBe("POST");
  const form = init.body as FormData;
  expect(form.get("copyrightConsent")).toBe("true");
  expect(form.get("file")).toBe(file);
  expect(onChange).toHaveBeenCalledWith({ id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] });
  expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
});

test("上げられなければ、API の理由を出して何も渡さない", async () => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "画像は4MBまでです" }) });
  const onChange = jest.fn();
  const onUploadingChange = jest.fn();
  render(<CatalogReferenceField value={null} onChange={onChange} onUploadingChange={onUploadingChange} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "画像は4MBまでです");
  expect(onChange).not.toHaveBeenCalled();
  expect(onUploadingChange.mock.calls).toEqual([[true], [false]]);
});

test("API が理由を返さなければ、決まった文言を出す", async () => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => { throw new Error("not json"); } });
  render(<CatalogReferenceField value={null} onChange={jest.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceConsent" }));

  pickFile();

  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "catalogReferenceUploadFailed");
});

describe("見本を選んだあと", () => {
  const value: CatalogReferenceValue = { id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] };

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
