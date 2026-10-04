/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「ガチャプロンプトにする」。
 * 出してよいかは /free のサーバー側が判定して gachaPromptAvailable で渡す
 * (公開フラグ NEXT_PUBLIC_GACHA_PROMPT_ENABLED OR 運営)。候補欄は本文の末尾に付けて送る。
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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationForm } from "@/features/generation/components/GenerationForm";
import { GACHA_FIELD_TEMPLATE } from "@/shared/generation/gacha-prompt";

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


const CANDIDATES = "{{GACHA}}\n1. パティシエ\n2. 消防士\n{{/GACHA}}";

function renderFreeForm(
  onSubmit: jest.Mock,
  props: Partial<React.ComponentProps<typeof GenerationForm>> = {},
) {
  return render(
    <GenerationForm
      subscriptionPlan="free"
      onSubmit={onSubmit}
      mode="free"
      gachaPromptAvailable
      {...props}
    />,
  );
}

async function fillBodyAndImage(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("mock-upload"));
  fireEvent.change(screen.getByLabelText("promptLabel"), {
    target: { value: "指定された職業を体験している様子を描く。" },
  });
}

function gachaCheckbox() {
  return screen.queryByRole("checkbox", { name: "gachaToggleLabel" });
}

describe("GenerationForm のガチャプロンプト", () => {
  test("出してよいと判定されていない利用者にはチェックが出ない", () => {
    renderFreeForm(jest.fn(), { gachaPromptAvailable: false });
    expect(gachaCheckbox()).toBeNull();
  });

  test("派生生成(プロンプト施錠)のシートにはチェックが出ない", () => {
    renderFreeForm(jest.fn(), { promptLocked: true, sourcePostId: "post-1" });
    expect(gachaCheckbox()).toBeNull();
  });

  test("チェックしなければ本文だけを送る", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderFreeForm(onSubmit);

    expect(gachaCheckbox()?.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("gachaFieldLabel")).toBeNull();

    await fillBodyAndImage(user);
    await user.click(screen.getByTestId("mock-submit"));

    expect(onSubmit.mock.calls[0][0].prompt).toBe(
      "指定された職業を体験している様子を描く。",
    );
  });

  test("チェックすると雛形入りの欄が出て、候補が2つそろうまで送れない", async () => {
    const user = userEvent.setup();
    renderFreeForm(jest.fn());
    await fillBodyAndImage(user);

    await user.click(gachaCheckbox()!);

    const field = screen.getByLabelText("gachaFieldLabel") as HTMLTextAreaElement;
    expect(field.value).toBe(GACHA_FIELD_TEMPLATE);
    expect(screen.getByTestId("gacha-prompt-error").textContent).toBe(
      "gachaTooFewCandidates",
    );
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);

    fireEvent.change(field, { target: { value: CANDIDATES } });

    expect(screen.getByTestId("gacha-prompt-error").textContent).toBe("");
    await waitFor(() =>
      expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", false),
    );
  });

  test("囲みを消すと、囲みが無いと知らせて送れない", async () => {
    const user = userEvent.setup();
    renderFreeForm(jest.fn());
    await fillBodyAndImage(user);
    await user.click(gachaCheckbox()!);

    fireEvent.change(screen.getByLabelText("gachaFieldLabel"), {
      target: { value: "1. パティシエ\n2. 消防士" },
    });

    expect(screen.getByTestId("gacha-prompt-error").textContent).toBe(
      "gachaMissingBlock",
    );
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);
  });

  test("本文の末尾に候補欄を付けた1つのプロンプトとして送る", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderFreeForm(onSubmit);
    await fillBodyAndImage(user);
    await user.click(gachaCheckbox()!);
    fireEvent.change(screen.getByLabelText("gachaFieldLabel"), {
      target: { value: CANDIDATES },
    });

    await user.click(screen.getByTestId("mock-submit"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].prompt).toBe(
      `指定された職業を体験している様子を描く。\n\n${CANDIDATES}`,
    );
  });

  test("チェックを外すと、候補欄に何が入っていても本文だけを送る", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderFreeForm(onSubmit);
    await fillBodyAndImage(user);
    await user.click(gachaCheckbox()!);
    fireEvent.change(screen.getByLabelText("gachaFieldLabel"), {
      target: { value: CANDIDATES },
    });
    await user.click(gachaCheckbox()!);

    await user.click(screen.getByTestId("mock-submit"));

    expect(onSubmit.mock.calls[0][0].prompt).toBe(
      "指定された職業を体験している様子を描く。",
    );
  });

  test("「空に戻す」で雛形に戻る", async () => {
    const user = userEvent.setup();
    renderFreeForm(jest.fn());
    await user.click(gachaCheckbox()!);
    const field = screen.getByLabelText("gachaFieldLabel") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "消してしまった" } });

    await user.click(screen.getByRole("button", { name: "gachaReset" }));

    expect(field.value).toBe(GACHA_FIELD_TEMPLATE);
  });

  test("「ガチャに分ける」は道具が使える人だけ、ガチャの欄の中に出す", async () => {
    const user = userEvent.setup();
    const { unmount } = renderFreeForm(jest.fn());
    await user.click(gachaCheckbox()!);
    expect(screen.queryByTestId("gacha-split-tool")).toBeNull();
    unmount();

    renderFreeForm(jest.fn(), { gachaSplitAvailable: true });
    expect(screen.queryByTestId("gacha-split-tool")).toBeNull();
    await user.click(gachaCheckbox()!);
    expect(screen.getByTestId("gacha-split-tool")).toBeTruthy();
  });
  test("「ガチャに分ける」の案を見せている間は、本文と候補欄を書き換えられない", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/api/gacha-prompt/split")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              body: "本文",
              field: CANDIDATES,
              removedLines: [2],
              candidateCount: 2,
              balance: 95,
            }),
          }
        : { ok: true, status: 200, json: async () => ({ items: [], nextOffset: null }) },
    );
    renderFreeForm(jest.fn(), { gachaSplitAvailable: true });
    fireEvent.change(screen.getByLabelText("promptLabel"), {
      target: { value: "本文\n例：パティシエ、消防士" },
    });
    await user.click(gachaCheckbox()!);

    await user.click(screen.getByRole("button", { name: /gachaSplitButton/ }));
    await screen.findByTestId("gacha-split-proposal");

    expect(screen.getByLabelText("promptLabel")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("gachaFieldLabel")).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: "gachaSplitAccept" }));

    expect(screen.getByLabelText("promptLabel")).toHaveProperty("disabled", false);
    expect((screen.getByLabelText("promptLabel") as HTMLTextAreaElement).value).toBe("本文");
    expect((screen.getByLabelText("gachaFieldLabel") as HTMLTextAreaElement).value).toBe(CANDIDATES);
  });
});
