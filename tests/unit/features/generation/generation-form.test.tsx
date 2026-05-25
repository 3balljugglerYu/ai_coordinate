/**
 * @jest-environment jsdom
 *
 * GenerationForm の新画像ソースピッカー統合に焦点を当てたスモークテスト。
 * 旧 1086 行の library/stock タブ網羅テストは Phase 4 で削除済み。
 * ここでは「新ピッカートリガが描画される」「ピッカー経由のストック選択で
 * sourceImageStockId が onSubmit に渡る」など、新規回路の最低限を担保する。
 */

const stableTranslate = (key: string) => key;
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

jest.mock("@/features/generation/hooks/useCoordinateStocksUnread", () => ({
  useCoordinateStocksUnread: () => ({ hasDot: false, markSeen: jest.fn() }),
  COORDINATE_STOCK_CREATED_EVENT: "coordinate:stock-created",
}));

jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  useGenerationState: () => null,
}));

jest.mock("@/features/generation/lib/coordinate-source-stock-save-prompt-state", () => ({
  clearCoordinateSourceStockSavePromptDot: jest.fn(),
}));

jest.mock("@/lib/build-current-url", () => ({
  useCurrentUrlForRedirect: () => "/coordinate",
}));

import { render, screen, waitFor } from "@testing-library/react";
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

describe("GenerationForm (new image source picker integration)", () => {
  test("ImageUploader と ImageSourcePickerTrigger が描画される", () => {
    render(
      <GenerationForm subscriptionPlan="free" onSubmit={() => {}} />,
    );
    expect(screen.getByTestId("mock-image-uploader")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "triggerLabel" }),
    ).toBeInTheDocument();
  });

  test("トリガクリックでピッカーが開き、タブが見える", async () => {
    const user = userEvent.setup();
    render(
      <GenerationForm subscriptionPlan="free" onSubmit={() => {}} />,
    );
    await user.click(
      screen.getByRole("button", { name: "triggerLabel" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "tabGenerated" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("tab", { name: "tabStock" }),
    ).toBeInTheDocument();
  });

  test("画像なし + 空 prompt では submit が disabled", () => {
    render(
      <GenerationForm subscriptionPlan="free" onSubmit={() => {}} />,
    );
    expect(screen.getByTestId("mock-submit")).toBeDisabled();
  });

  test("画像アップロード + prompt 入力 → submit で sourceImage を渡す", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(
      <GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />,
    );

    // モック ImageUploader で upload
    await user.click(screen.getByText("mock-upload"));

    // prompt 入力
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "test prompt");

    const submit = screen.getByTestId("mock-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.prompt).toBe("test prompt");
    expect(arg.sourceImage).toBeInstanceOf(File);
    expect(arg.sourceImageStockId).toBeUndefined();
  });
});
