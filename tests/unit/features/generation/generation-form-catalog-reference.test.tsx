/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「見本(参照画像)」の欄の出し分けと送信(GenerationForm)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 見本を使える人(サーバーで一覧を確かめた人)の、じゆうモードの自分で書く本文にだけ出す
 *    (派生生成・コーディネート・使えない人には出さない)
 *  - 見本を選んだときだけ、id とまねるものを送る
 *  - 上げている間と、まねるものが0個のときは送らない
 */

// 見本の欄は部品のテストで確かめるので、ここでは値を渡すだけにする
const mockReferenceField = jest.fn();
jest.mock("@/features/catalog-references/components/CatalogReferenceField", () => ({
  CatalogReferenceField: (props: {
    onChange: (value: unknown) => void;
    onUploadingChange: (uploading: boolean) => void;
  }) => {
    mockReferenceField(props);
    return (
      <div data-testid="mock-reference-field">
        <button type="button" onClick={() => props.onChange({ id: "ref-1", previewUrl: "blob:r", takes: ["outfit", "pose"] })}>
          mock-pick-reference
        </button>
        <button type="button" onClick={() => props.onChange({ id: "ref-1", previewUrl: "blob:r", takes: [] })}>
          mock-empty-takes
        </button>
        <button type="button" onClick={() => props.onUploadingChange(true)}>
          mock-uploading
        </button>
      </div>
    );
  },
}));

// 文言はキーのまま返す。差し込んだ値(試しの欄の見出しなど)は呼び出しの記録から確かめる
const stableTranslate = jest.fn<string, [string, Record<string, unknown>?]>((key) => key);
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

jest.mock("@/features/generation/lib/database", () => ({
  getSourceImageStocks: jest.fn(async () => []),
  getStockImageLimit: jest.fn(async () => 10),
  getCurrentStockImageCount: jest.fn(async () => 0),
  deleteSourceImageStock: jest.fn(async () => {}),
}));

jest.mock("@/features/generation/components/GeneratedImagesFromSource", () => ({
  GeneratedImagesFromSource: () => null,
}));

jest.mock("@/features/generation/components/ImageUploader", () => ({
  ImageUploader: ({
    onImageUpload,
    onImageRemove,
    value,
  }: {
    onImageUpload: (image: {
      file: File;
      previewUrl: string;
      width: number;
      height: number;
    }) => void;
    onImageRemove?: () => void;
    value?: unknown;
  }) => (
    <div data-testid="mock-image-uploader">
      <button
        type="button"
        onClick={() =>
          onImageUpload({
            file: new File(["x"], "u.png", { type: "image/png" }),
            previewUrl: "blob:mock",
            width: 100,
            height: 100,
          })
        }
      >
        mock-upload
      </button>
      {value ? (
        <button type="button" onClick={onImageRemove}>
          mock-remove
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock("@/features/generation/components/GenerationModelControls", () => ({
  GenerationModelControls: () => <div data-testid="mock-model-controls" />,
}));

jest.mock("@/features/generation/components/GenerationSubmitButton", () => ({
  GenerationSubmitButton: ({
    onClick,
    disabled,
  }: {
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="mock-submit"
      disabled={disabled}
      onClick={onClick}
    >
      submit
    </button>
  ),
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

jest.mock(
  "@/features/subscription/components/SubscriptionUpsellDialog",
  () => ({
    SubscriptionUpsellDialog: () => null,
  }),
);


jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  useGenerationState: () => null,
}));

jest.mock("@/features/generation/lib/coordinate-source-stock-save-prompt-state", () => ({
  clearCoordinateSourceStockSavePromptDot: jest.fn(),
}));

jest.mock("@/lib/build-current-url", () => ({
  useCurrentUrlForRedirect: () => "/coordinate",
}));

// 別画面から持ち越した画像 URL をファイルにする境界(fetch + 画像の読み込み)
const mockFetchSourceImage = jest.fn();
jest.mock("@/features/generation/lib/source-image-to-file", () => ({
  fetchSourceImageAsUploadedImage: (...args: unknown[]) =>
    mockFetchSourceImage(...args),
}));

// 取り込んだことのスナックバー(2026-10-11)
const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationForm } from "@/features/generation/components/GenerationForm";

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items: [], nextOffset: null }),
  });
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
    writable: true,
    configurable: true,
  });
  // jsdom には URL.revokeObjectURL が無いため polyfill。
  // GenerationForm が blob URL の cleanup でこれを呼ぶ。
  if (typeof URL.revokeObjectURL !== "function") {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  }
});




function renderForm(onSubmit: jest.Mock, props: Partial<React.ComponentProps<typeof GenerationForm>> = {}) {
  return render(
    <GenerationForm subscriptionPlan="free" onSubmit={onSubmit} mode="free" catalogReferenceAvailable {...props} />,
  );
}

async function fillBodyAndImage(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("mock-upload"));
  fireEvent.change(screen.getByLabelText("promptLabel"), { target: { value: "冬の街を歩く様子" } });
}

describe("見本の欄の出し分け", () => {
  test("見本を使える人の、じゆうモードの自分で書く本文には出す", () => {
    renderForm(jest.fn());
    expect(screen.getByTestId("mock-reference-field")).toBeTruthy();
  });

  test.each([
    ["見本を使えない人", { catalogReferenceAvailable: false }],
    ["コーディネート", { mode: "coordinate" as const }],
    ["派生生成(本文が施錠されている)", { promptLocked: true, sourcePostId: "post-1", lockedPromptText: "" }],
    ["ログインしていない", { authState: "guest" as const }],
  ])("%s には出さない", (_label, props) => {
    renderForm(jest.fn(), props);
    expect(screen.queryByTestId("mock-reference-field")).toBeNull();
  });
});

describe("見本の送信", () => {
  test("見本を選んだら、id とまねるものを送る", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await fillBodyAndImage(user);

    await user.click(screen.getByText("mock-pick-reference"));
    await user.click(screen.getByTestId("mock-submit"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      generationType: "free",
      referenceImageId: "ref-1",
      referenceTakes: ["outfit", "pose"],
    });
  });

  test("見本を選ばなければ、見本の項目を送らない", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await fillBodyAndImage(user);

    await user.click(screen.getByTestId("mock-submit"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect("referenceImageId" in onSubmit.mock.calls[0][0]).toBe(false);
    expect("referenceTakes" in onSubmit.mock.calls[0][0]).toBe(false);
  });

  test.each([
    ["まねるものが0個", "mock-empty-takes"],
    ["見本を上げている間", "mock-uploading"],
  ])("%s は送らない", async (_label, trigger) => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await fillBodyAndImage(user);

    await user.click(screen.getByText(trigger));

    expect((screen.getByTestId("mock-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
