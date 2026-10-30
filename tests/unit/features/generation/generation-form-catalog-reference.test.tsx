/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「見本(参照画像)」の欄の出し分けと送信(GenerationForm)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 見本を使える人(サーバーで一覧を確かめた人)の、じゆうモードの自分で書く本文にだけ出す
 *    (派生生成・コーディネート・使えない人には出さない。出さない人の画像の欄は今のまま)
 *  - 見本を使える人は、うちの子と見本の2枚並べ(第2案)。うちの子の欄は見出しを消して縦長にする
 *  - 同意済みか(サーバーで確かめた値)を、そのまま渡す
 *  - まねるものの欄は、見本を入れたときだけ出す
 *  - 見本を選んだときだけ、id とまねるものを送る
 *  - 上げている間と、まねるものが0個のときは送らない
 */

// 見本の欄は部品のテストで確かめるので、ここでは値を渡すだけにする
const mockReferencePicker = jest.fn();
jest.mock("@/features/catalog-references/components/CatalogReferencePicker", () => ({
  CatalogReferencePicker: (props: {
    ownImage: React.ReactNode;
    onChange: (value: unknown) => void;
    onUploadingChange: (uploading: boolean) => void;
  }) => {
    mockReferencePicker(props);
    return (
      <div data-testid="mock-reference-picker">
        {props.ownImage}
        <button type="button" onClick={() => props.onChange({ id: "ref-1", previewUrl: "blob:r", takes: ["outfit", "pose"] })}>
          mock-pick-reference
        </button>
        <button type="button" onClick={() => props.onUploadingChange(true)}>
          mock-uploading
        </button>
      </div>
    );
  },
}));
jest.mock("@/features/catalog-references/components/CatalogReferenceTakes", () => ({
  CatalogReferenceTakes: (props: { value: { id: string }; onChange: (value: unknown) => void }) => (
    <div data-testid="mock-reference-takes">
      <button type="button" onClick={() => props.onChange({ ...props.value, takes: [] })}>
        mock-empty-takes
      </button>
    </div>
  ),
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

const mockImageUploader = jest.fn();
jest.mock("@/features/generation/components/ImageUploader", () => ({
  ImageUploader: ({
    onImageUpload,
    onImageRemove,
    value,
    ...layout
  }: {
    label?: string;
    hideLabel?: boolean;
    aspectRatio?: number;
    onImageUpload: (image: {
      file: File;
      previewUrl: string;
      width: number;
      height: number;
    }) => void;
    onImageRemove?: () => void;
    value?: unknown;
  }) => {
    // 並べ方(見出し・縦横の比)だけを記録する
    mockImageUploader(layout);
    return (
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
    );
  },
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

import { fireEvent, render, screen, within } from "@testing-library/react";
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
  beforeEach(() => {
    mockReferencePicker.mockClear();
    mockImageUploader.mockClear();
  });

  test("見本を使える人の、じゆうモードの自分で書く本文には、うちの子と見本の2枚並べを出す", () => {
    renderForm(jest.fn(), { catalogReferenceConsented: true });

    expect(screen.getByTestId("mock-reference-picker")).toBeTruthy();
    expect(screen.getByText("catalogReferenceImagesLabel")).toBeTruthy();
    // うちの子の欄は並べた中にあり、見出しは読み上げだけに残して縦長にする
    expect(within(screen.getByTestId("mock-reference-picker")).getByTestId("mock-image-uploader")).toBeTruthy();
    expect(mockImageUploader).toHaveBeenLastCalledWith({
      label: "catalogReferenceOwnImagecatalogReferenceOwnImageRequired",
      hideLabel: true,
      aspectRatio: 3 / 4,
    });
    expect(mockReferencePicker.mock.lastCall?.[0]).toMatchObject({ consented: true, value: null });
  });

  test.each([
    ["見本を使えない人", { catalogReferenceAvailable: false }],
    ["コーディネート", { mode: "coordinate" as const }],
    ["派生生成(本文が施錠されている)", { promptLocked: true, sourcePostId: "post-1", lockedPromptText: "" }],
    ["ログインしていない", { authState: "guest" as const }],
  ])("%s には出さず、画像の欄は今のまま", (_label, props) => {
    renderForm(jest.fn(), props);

    expect(screen.queryByTestId("mock-reference-picker")).toBeNull();
    expect(screen.queryByText("catalogReferenceImagesLabel")).toBeNull();
    expect(screen.getByText("imageSourceLabel")).toBeTruthy();
    expect(mockImageUploader).toHaveBeenLastCalledWith({});
  });

  test("まねるものの欄は、見本を入れたときだけ出す", async () => {
    const user = userEvent.setup();
    renderForm(jest.fn());
    expect(screen.queryByTestId("mock-reference-takes")).toBeNull();

    await user.click(screen.getByText("mock-pick-reference"));

    expect(screen.getByTestId("mock-reference-takes")).toBeTruthy();
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
    ["まねるものが0個", ["mock-pick-reference", "mock-empty-takes"]],
    ["見本を上げている間", ["mock-uploading"]],
  ])("%s は送らない", async (_label, triggers) => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await fillBodyAndImage(user);
    // きっかけの前は送れる(ほかの理由で止まっていないことを先に確かめる)
    expect((screen.getByTestId("mock-submit") as HTMLButtonElement).disabled).toBe(false);

    for (const trigger of triggers) {
      await user.click(screen.getByText(trigger));
    }

    expect((screen.getByTestId("mock-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
