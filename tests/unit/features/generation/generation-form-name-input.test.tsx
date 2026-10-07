/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「名前を入れられるようにする」と「プロンプトの仕掛け」の箱
 * (docs/planning/name-input-slot-plan.md Phase 2)。スイッチのオン・オフは本文の目印の有無そのもの。
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

function renderNameForm(onSubmit: jest.Mock, props: Partial<React.ComponentProps<typeof GenerationForm>> = {}) {
  return renderFreeForm(onSubmit, { gachaPromptAvailable: false, nameInputAvailable: true, ...props });
}

function nameSwitch() {
  return screen.queryByRole("switch", { name: "nameInputToggleLabel" });
}

function promptField() {
  return screen.getByLabelText("promptLabel") as HTMLTextAreaElement;
}

describe("プロンプトの仕掛けの箱", () => {
  test("名前もガチャも使えない人には箱ごと出さない", () => {
    renderFreeForm(jest.fn(), { gachaPromptAvailable: false, nameInputAvailable: false });
    expect(screen.queryByTestId("prompt-gimmicks-box")).toBeNull();
  });

  test("両方使える人には、名前→ガチャの順にスイッチを並べる", () => {
    renderFreeForm(jest.fn(), { gachaPromptAvailable: true, nameInputAvailable: true });
    const box = screen.getByTestId("prompt-gimmicks-box");
    const switches = Array.from(box.querySelectorAll('[role="switch"]'));
    expect(switches.map((el) => el.id)).toEqual(["name-input-enabled", "gacha-prompt-enabled"]);
  });

  test("派生生成(プロンプト施錠)には出さない", () => {
    renderNameForm(jest.fn(), { promptLocked: true, sourcePostId: "11111111-1111-4111-8111-111111111111" });
    expect(nameSwitch()).toBeNull();
  });
});

describe("名前を入れられるようにする", () => {
  test("オンにすると本文の先頭に目印が入り、切ると消える", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn());
    await fillBodyAndImage(user);

    await user.click(nameSwitch()!);
    expect(nameSwitch()!.getAttribute("aria-checked")).toBe("true");
    expect(promptField().value.startsWith("{{INPUT:nameInputDefaultLabel}}\n")).toBe(true);

    await user.click(nameSwitch()!);
    expect(nameSwitch()!.getAttribute("aria-checked")).toBe("false");
    expect(promptField().value).not.toContain("{{INPUT");
  });

  test("本文に目印を手で書くとスイッチがオンになり、設定に見出しが出る", () => {
    renderNameForm(jest.fn());
    fireEvent.change(promptField(), { target: { value: "診断\n{{INPUT*:うちの子|例：ぺるこ}}" } });
    expect(nameSwitch()!.getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("nameInputLabelSetting") as HTMLInputElement).value).toBe("うちの子");
    expect((screen.getByLabelText("nameInputPlaceholderSetting") as HTMLInputElement).value).toBe("例：ぺるこ");
  });

  test("見出し・入力例・必須を変えると、本文の目印も書き換わる", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn());
    fireEvent.change(promptField(), { target: { value: "{{INPUT:名前}}\n診断" } });

    fireEvent.change(screen.getByLabelText("nameInputLabelSetting"), { target: { value: "うちの子" } });
    fireEvent.change(screen.getByLabelText("nameInputPlaceholderSetting"), { target: { value: "ぺるこ" } });
    await user.click(screen.getByRole("button", { name: "nameInputRequiredOption" }));

    expect(promptField().value).toBe("{{INPUT*:うちの子|ぺるこ}}\n診断");
  });

  test("見出しを消しても、書き直せる(既定の見出しで埋めない)", () => {
    renderNameForm(jest.fn());
    fireEvent.change(promptField(), { target: { value: "{{INPUT:名前}}" } });
    fireEvent.change(screen.getByLabelText("nameInputLabelSetting"), { target: { value: "" } });
    expect((screen.getByLabelText("nameInputLabelSetting") as HTMLInputElement).value).toBe("");
  });

  test("試しの名前を書いたら、名前を一緒に送る", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderNameForm(onSubmit);
    await fillBodyAndImage(user);
    await user.click(nameSwitch()!);
    fireEvent.change(screen.getByLabelText("nameInputTrialLabel"), { target: { value: " ぺるこ " } });

    await user.click(screen.getByTestId("mock-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ nameInput: "ぺるこ", generationType: "free" });
    expect(onSubmit.mock.calls[0][0].prompt).toContain("{{INPUT:nameInputDefaultLabel}}");
  });

  test("試しの名前が空なら名前は送らない(サーバーで「名前なし」になる)", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderNameForm(onSubmit);
    await fillBodyAndImage(user);
    await user.click(nameSwitch()!);
    await user.click(screen.getByTestId("mock-submit"));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("nameInput");
  });

  test("9文字以上は送れず、欄から離れたら赤字で知らせる", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn());
    await fillBodyAndImage(user);
    await user.click(nameSwitch()!);
    const trial = screen.getByLabelText("nameInputTrialLabel");
    fireEvent.change(trial, { target: { value: "あいうえおかきくけ" } });
    expect(screen.getByTestId("name-input-trial-hint").getAttribute("data-tone")).toBe("hint");
    fireEvent.blur(trial);

    expect(screen.getByTestId("name-input-trial-hint").textContent).toBe("nameInputTooLong");
    expect(screen.getByTestId("name-input-trial-hint").getAttribute("data-tone")).toBe("error");
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);
  });

  test("波かっこを含む名前は送れない", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn());
    await fillBodyAndImage(user);
    await user.click(nameSwitch()!);
    fireEvent.change(screen.getByLabelText("nameInputTrialLabel"), { target: { value: "{{GACHA}}" } });
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);
  });

  test("必須で空なら送れない。名前を書けば送れる", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn());
    await fillBodyAndImage(user);
    fireEvent.change(promptField(), { target: { value: "{{INPUT*:名前}}\n診断" } });
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("nameInputTrialLabel"), { target: { value: "ぺるこ" } });
    await waitFor(() => expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", false));
  });
});

describe("名前の欄: code-review の指摘への対応", () => {
  test("見出しと入力例に空白を打てる(本文の目印は前後の空白を落とす)", () => {
    renderNameForm(jest.fn());
    fireEvent.change(promptField(), { target: { value: "{{INPUT:名前}}" } });
    const label = screen.getByLabelText("nameInputLabelSetting") as HTMLInputElement;
    fireEvent.change(label, { target: { value: "Character " } });
    expect(label.value).toBe("Character ");
    fireEvent.change(label, { target: { value: "Character name" } });
    expect(label.value).toBe("Character name");
    expect(promptField().value).toBe("{{INPUT:Character name}}");
  });

  test("本文の目印を手で書き換えたら、見出しの欄も合わせる", () => {
    renderNameForm(jest.fn());
    fireEvent.change(promptField(), { target: { value: "{{INPUT:名前}}" } });
    fireEvent.change(promptField(), { target: { value: "{{INPUT:うちの子}}" } });
    expect((screen.getByLabelText("nameInputLabelSetting") as HTMLInputElement).value).toBe("うちの子");
  });

  test("名前の欄が2つあると、知らせて送れない(サーバーと同じ数え方)", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn());
    await fillBodyAndImage(user);
    fireEvent.change(promptField(), { target: { value: "{{INPUT:a}}\n{{INPUT:b}}" } });
    expect(screen.getByTestId("name-input-too-many").textContent).toBe("nameInputTooManySlots");
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);
  });

  test("運営は名前の欄が2つでも送れる", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn(), { nameInputUnlimited: true });
    await fillBodyAndImage(user);
    fireEvent.change(promptField(), { target: { value: "{{INPUT:a}}\n{{INPUT:b}}" } });
    expect(screen.queryByTestId("name-input-too-many")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", false));
  });

  test("目印がガチャの欄にだけあっても、試しの名前を入れて送れる", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderNameForm(onSubmit, { gachaPromptAvailable: true });
    await fillBodyAndImage(user);
    await user.click(screen.getByRole("switch", { name: "gachaToggleLabel" }));
    fireEvent.change(screen.getByLabelText("gachaFieldLabel"), {
      target: { value: "{{GACHA}}\n1. 医師 {{INPUT:名前}}\n2. 探偵 {{INPUT:名前}}\n{{/GACHA}}" },
    });
    expect(nameSwitch()!.getAttribute("aria-checked")).toBe("false");
    fireEvent.change(screen.getByLabelText("nameInputTrialLabel"), { target: { value: "ぺるこ" } });
    await user.click(screen.getByTestId("mock-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ nameInput: "ぺるこ" });
  });
});

describe("カタログから使う人の名前の欄(派生生成)", () => {
  const SOURCE = "11111111-1111-4111-8111-111111111111";
  const lockedProps = (required: boolean) => ({
    promptLocked: true,
    sourcePostId: SOURCE,
    lockedNameInput: { label: "うちの子", placeholder: "例：ぺるこ", required },
  });

  test("画像の下に、作る人が決めた見出しで名前の欄を出す", () => {
    renderNameForm(jest.fn(), lockedProps(false));
    const field = screen.getByTestId("name-input-entry");
    expect(field.textContent).toContain("nameInputEntryOptionalLabel");
    expect((screen.getByLabelText("nameInputEntryOptionalLabel") as HTMLInputElement).placeholder).toBe("例：ぺるこ");
    // 作る人の「プロンプトの仕掛け」の箱は出さない
    expect(screen.queryByTestId("prompt-gimmicks-box")).toBeNull();
  });

  test("名前を書いたら、原作の ID と一緒に名前を送る(本文は送らない)", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderNameForm(onSubmit, lockedProps(false));
    await user.click(screen.getByText("mock-upload"));
    fireEvent.change(screen.getByLabelText("nameInputEntryOptionalLabel"), { target: { value: "ぺるこ" } });
    await user.click(screen.getByTestId("mock-submit"));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ sourcePostId: SOURCE, nameInput: "ぺるこ" });
  });

  test("必須で空なら送れない", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn(), lockedProps(true));
    await user.click(screen.getByText("mock-upload"));
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("うちの子"), { target: { value: "ぺるこ" } });
    await waitFor(() => expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", false));
  });

  test("名前の欄の情報を取りに行っている間は、生成させない", async () => {
    const user = userEvent.setup();
    renderNameForm(jest.fn(), { promptLocked: true, sourcePostId: SOURCE, lockedNameInput: null, lockedNameInputLoading: true });
    await user.click(screen.getByText("mock-upload"));
    expect(screen.getByTestId("mock-submit")).toHaveProperty("disabled", true);
  });

  test("名前の欄が無い原作では出さない", () => {
    renderNameForm(jest.fn(), { promptLocked: true, sourcePostId: SOURCE, lockedNameInput: null });
    expect(screen.queryByTestId("name-input-entry")).toBeNull();
  });
});

