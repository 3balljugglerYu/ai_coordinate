/**
 * @jest-environment jsdom
 *
 * カタログをつくる(/free)の「見本(参照画像)」の欄の出し分けと送信(GenerationForm)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 見本を使える人(サーバーで一覧を確かめた人)の、じゆうモードの自分で書く本文にだけ、
 *    「プロンプトから」「イラストから」のタブを出す(派生生成・コーディネート・使えない人には出さず、画像の欄は今のまま)
 *  - はじめは「プロンプトから」で、今までの作る画面(見本の欄なし・プロンプト必須)
 *  - 「イラストから」では、うちの子と見本の2枚並べ(第2案)。うちの子の欄は見出しを読み上げだけに残して縦長にする。
 *    同意の状態(サーバーで確かめた値)を、そのまま渡す。プロンプトの見出しは「なくてもOK」のものにする
 *  - 「先行公開」の案内の「ためしてみる」で「イラストから」へ移る
 *  - タブを切り替えても見本の欄は作り直さず、隠すだけ(この画面での同意や、上げている途中の状態を消さない)
 *  - 見本のプレビューの blob URL は、値を持つここで、外したときに放す
 *  - カタログから使う画面(派生生成)で、元の作品がプロンプトなしで作られていたら、非公開とは分けて知らせる
 *  - まねるものの欄は、「イラストから」で見本を入れたときだけ出す
 *  - 「イラストから」は、見本を入れてまねるものを選べば、プロンプトなしでも送れる。見本の id とまねるものを送る
 *  - 「イラストから」は、見本を入れるまで・上げている間・まねるものが0個のときは送らない
 *  - 「プロンプトから」に戻したら、選んだ見本は送らず、プロンプトは今までどおり必須
 */

// 見本の欄は部品のテストで確かめるので、ここでは値を渡すだけにする
const mockReferencePicker = jest.fn();
const mockReferencePickerMounted = jest.fn();
jest.mock("@/features/catalog-references/components/CatalogReferencePicker", () => ({
  CatalogReferencePicker: (props: {
    ownImage: React.ReactNode;
    onChange: (value: unknown) => void;
    onUploadingChange: (uploading: boolean) => void;
  }) => {
    mockReferencePicker(props);
    // 作り直されたかを数える(タブの切り替えで作り直さないことを確かめる)
    jest.requireActual<typeof import("react")>("react").useEffect(() => {
      mockReferencePickerMounted();
    }, []);
    return (
      <div data-testid="mock-reference-picker">
        {props.ownImage}
        <button type="button" onClick={() => props.onChange({ id: "ref-1", previewUrl: "blob:r", takes: ["outfit", "pose"] })}>
          mock-pick-reference
        </button>
        <button type="button" onClick={() => props.onUploadingChange(true)}>
          mock-uploading
        </button>
        <button type="button" onClick={() => props.onChange(null)}>
          mock-remove-reference
        </button>
      </div>
    );
  },
}));
jest.mock("@/features/catalog-references/components/CatalogReferenceIntro", () => ({
  CatalogReferenceIntro: (props: { onTry: () => void }) => (
    <button type="button" onClick={props.onTry}>
      mock-intro-try
    </button>
  ),
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
    <GenerationForm
      subscriptionPlan="free"
      onSubmit={onSubmit}
      mode="free"
      catalogReference={{ userId: "user-1", consented: false, consentedBefore: false }}
      {...props}
    />,
  );
}

async function fillBodyAndImage(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("mock-upload"));
  fireEvent.change(screen.getByLabelText("promptLabel"), { target: { value: "冬の街を歩く様子" } });
}

async function openReferenceTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "createTabReference" }));
}

describe("作り方のタブと見本の欄の出し分け", () => {
  beforeEach(() => {
    mockReferencePicker.mockClear();
    mockImageUploader.mockClear();
  });

  test("見本を使える人には「プロンプトから」「イラストから」のタブを出し、はじめは「プロンプトから」(今の画像の欄・見本の欄なし)", () => {
    renderForm(jest.fn());

    expect(screen.getByRole("tab", { name: "createTabPrompt" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "createTabReference" }).getAttribute("aria-selected")).toBe("false");
    // 見本の欄は隠したまま(うちの子の欄は入れない)
    expect((screen.getByTestId("catalog-reference-panel") as HTMLElement).hidden).toBe(true);
    expect(mockReferencePicker.mock.lastCall?.[0]).toMatchObject({ ownImage: null });
    expect(screen.getByText("imageSourceLabel")).toBeTruthy();
    expect(mockImageUploader).toHaveBeenLastCalledWith({});
    expect(screen.getByLabelText("promptLabel")).toBeTruthy();
    // タブは枠の外の帯に置き、上に留めない(/free はヘッダーが固定なので、留めると隠れる)
    expect(screen.getByTestId("create-tab-bar").className).not.toMatch(/\bsticky\b/);
  });

  test("「イラストから」を押すと、うちの子と見本の2枚並べを出し、プロンプトは「なくてもOK」の見出しにする", async () => {
    const user = userEvent.setup();
    renderForm(jest.fn(), { catalogReference: { userId: "user-1", consented: true, consentedBefore: true } });

    await openReferenceTab(user);

    expect(screen.getByRole("tab", { name: "createTabReference" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByTestId("catalog-reference-panel") as HTMLElement).hidden).toBe(false);
    expect(screen.getByText("catalogReferenceImagesLabel")).toBeTruthy();
    // うちの子の欄は並べた中にあり、見出しは読み上げだけに残して縦長にする
    expect(within(screen.getByTestId("mock-reference-picker")).getByTestId("mock-image-uploader")).toBeTruthy();
    expect(mockImageUploader).toHaveBeenLastCalledWith({
      label: "catalogReferenceOwnImageLabel",
      hideLabel: true,
      aspectRatio: 3 / 4,
    });
    expect(mockReferencePicker.mock.lastCall?.[0]).toMatchObject({
      consented: true,
      consentedBefore: true,
      value: null,
    });
    expect(screen.getByLabelText("referencePromptLabel")).toBeTruthy();
  });

  test("「先行公開」の案内の「ためしてみる」で「イラストから」へ移る", async () => {
    const user = userEvent.setup();
    renderForm(jest.fn());

    await user.click(screen.getByText("mock-intro-try"));

    expect(screen.getByRole("tab", { name: "createTabReference" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByTestId("catalog-reference-panel") as HTMLElement).hidden).toBe(false);
  });

  test("タブを行き来しても、見本の欄の部品は作り直さない(同意や上げている途中の状態を消さない)", async () => {
    const user = userEvent.setup();
    mockReferencePickerMounted.mockClear();
    renderForm(jest.fn());

    await openReferenceTab(user);
    await user.click(screen.getByRole("tab", { name: "createTabPrompt" }));
    await openReferenceTab(user);

    expect(mockReferencePickerMounted).toHaveBeenCalledTimes(1);
    // うちの子の欄は、見せている側にだけ1つ置く
    expect(screen.getAllByTestId("mock-image-uploader")).toHaveLength(1);
  });

  test.each([
    ["見本を使えない人(値が渡っていない)", { catalogReference: undefined }],
    ["コーディネート", { mode: "coordinate" as const }],
    ["派生生成(本文が施錠されている)", { promptLocked: true, sourcePostId: "post-1", lockedPromptText: "" }],
    ["ログインしていない", { authState: "guest" as const }],
  ])("%s にはタブも見本の欄も出さず、画像の欄は今のまま", (_label, props) => {
    renderForm(jest.fn(), props);

    expect(screen.queryByRole("tab", { name: "createTabReference" })).toBeNull();
    expect(screen.queryByText("mock-intro-try")).toBeNull();
    expect(screen.queryByTestId("mock-reference-picker")).toBeNull();
    expect(screen.queryByText("catalogReferenceImagesLabel")).toBeNull();
    expect(screen.getByText("imageSourceLabel")).toBeTruthy();
    expect(mockImageUploader).toHaveBeenLastCalledWith({});
  });

  test("まねるものの欄は、「イラストから」で見本を入れたときだけ出す(「プロンプトから」に戻すと消す)", async () => {
    const user = userEvent.setup();
    renderForm(jest.fn());
    await openReferenceTab(user);
    expect(screen.queryByTestId("mock-reference-takes")).toBeNull();

    await user.click(screen.getByText("mock-pick-reference"));
    expect(screen.getByTestId("mock-reference-takes")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "createTabPrompt" }));
    expect(screen.queryByTestId("mock-reference-takes")).toBeNull();
  });

  test("見本を外したら、そのプレビューの blob URL を放す", async () => {
    const original = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const revoke = jest.fn();
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    try {
      const user = userEvent.setup();
      renderForm(jest.fn());
      await openReferenceTab(user);
      await user.click(screen.getByText("mock-pick-reference"));
      expect(revoke).not.toHaveBeenCalledWith("blob:r");

      await user.click(screen.getByText("mock-remove-reference"));

      expect(revoke).toHaveBeenCalledWith("blob:r");
    } finally {
      if (original) Object.defineProperty(URL, "revokeObjectURL", original);
    }
  });
});

describe("見本の送信", () => {
  const submitButton = () => screen.getByTestId("mock-submit") as HTMLButtonElement;

  test("「イラストから」で見本を選んだら、プロンプトと一緒に id とまねるものを送る", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await openReferenceTab(user);
    await user.click(screen.getByText("mock-upload"));
    fireEvent.change(screen.getByLabelText("referencePromptLabel"), { target: { value: "夕方の教室" } });

    await user.click(screen.getByText("mock-pick-reference"));
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      generationType: "free",
      prompt: "夕方の教室",
      referenceImageId: "ref-1",
      referenceTakes: ["outfit", "pose"],
    });
  });

  test("「イラストから」はプロンプトなしでも送れる(本文は空)", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await openReferenceTab(user);
    await user.click(screen.getByText("mock-upload"));
    await user.click(screen.getByText("mock-pick-reference"));

    expect(submitButton().disabled).toBe(false);
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ prompt: "", referenceImageId: "ref-1" });
  });

  test("「イラストから」は、見本を入れるまで送れない", async () => {
    const user = userEvent.setup();
    renderForm(jest.fn());
    await openReferenceTab(user);
    await user.click(screen.getByText("mock-upload"));

    expect(submitButton().disabled).toBe(true);
  });

  test.each([
    ["まねるものが0個", ["mock-pick-reference", "mock-empty-takes"]],
    ["見本を上げている間", ["mock-pick-reference", "mock-uploading"]],
  ])("「イラストから」で %s は送らない", async (_label, triggers) => {
    const user = userEvent.setup();
    renderForm(jest.fn());
    await openReferenceTab(user);
    await user.click(screen.getByText("mock-upload"));
    await user.click(screen.getByText("mock-pick-reference"));
    // きっかけの前は送れる(ほかの理由で止まっていないことを先に確かめる)
    expect(submitButton().disabled).toBe(false);

    for (const trigger of triggers.slice(1)) {
      await user.click(screen.getByText(trigger));
    }

    expect(submitButton().disabled).toBe(true);
  });

  test("「プロンプトから」に戻したら、選んだ見本は送らず、プロンプトは今までどおり必須", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await openReferenceTab(user);
    await user.click(screen.getByText("mock-pick-reference"));
    await user.click(screen.getByRole("tab", { name: "createTabPrompt" }));
    await user.click(screen.getByText("mock-upload"));

    // プロンプトが空のうちは送れない
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("promptLabel"), { target: { value: "冬の街を歩く様子" } });
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect("referenceImageId" in onSubmit.mock.calls[0][0]).toBe(false);
    expect("referenceTakes" in onSubmit.mock.calls[0][0]).toBe(false);
  });

  test("見本を使わずに「プロンプトから」で送ると、見本の項目を送らない", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderForm(onSubmit);
    await fillBodyAndImage(user);

    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect("referenceImageId" in onSubmit.mock.calls[0][0]).toBe(false);
  });
});

describe("カタログから使う画面(派生生成)のプロンプトの欄", () => {
  test.each([
    ["元の作品がプロンプトなしで作られている(本文が空)", "", "sourcePromptEmpty"],
    // 本文の API は見本つきの作品だけ空文字にそろえて返す。空白だけが届くのは見本つきでない作品なので、プロンプトなしとはしない
    ["元の作品の本文が空白だけ(見本つきでない作品)", "   ", "lockedSheetPromptLocked"],
    ["本文が取れない(非公開など)", null, "lockedSheetPromptLocked"],
  ])("%s ときの見出し", (_label, lockedPromptText, placeholder) => {
    renderForm(jest.fn(), {
      catalogReference: undefined,
      promptLocked: true,
      sourcePostId: "post-1",
      lockedPromptText,
    });

    expect(screen.getByLabelText("lockedSheetPromptLabel").getAttribute("placeholder")).toBe(placeholder);
  });
});


describe("作り直しの引継ぎ",()=>{
 afterEach(()=>{window.history.replaceState(null,"","/");});
 test("文章とまねるものを引き継いでも、新しい見本を選ぶまで生成しない",async()=>{
  window.history.replaceState(null,"","/free?remake=rejected-image");
  fetchMock.mockImplementation((url:string)=>Promise.resolve({ok:true,json:async()=>url.includes("/remake/")?{prompt:"autumn pose",takes:["pose"]}:{items:[],nextOffset:null}}));
  const onSubmit=jest.fn();renderForm(onSubmit);
  await screen.findByText("remakeReady");
  expect(screen.getByDisplayValue("autumn pose")).toBeInTheDocument();
  expect(mockReferencePicker).toHaveBeenLastCalledWith(expect.objectContaining({initialTakes:["pose"],value:null}));
  expect(screen.getByTestId("mock-submit")).toBeDisabled();expect(onSubmit).not.toHaveBeenCalled();
 });
 test("一覧から外れた人は引継ぎを取得しない",async()=>{
  window.history.replaceState(null,"","/free?remake=rejected-image");renderForm(jest.fn(),{catalogReference:undefined});
  await screen.findByRole("alert");expect(fetchMock.mock.calls.some(([url])=>String(url).includes("/remake/"))).toBe(false);
 });
 test("取得失敗を案内し、文章や見本を補わない",async()=>{
  window.history.replaceState(null,"","/free?remake=rejected-image");
  fetchMock.mockImplementation((url:string)=>Promise.resolve({ok:!url.includes("/remake/"),json:async()=>({items:[],nextOffset:null})}));renderForm(jest.fn());
  await screen.findByText("remakeFailed");expect(screen.queryByText("remakeReady")).not.toBeInTheDocument();
 });
});
