/** @jest-environment jsdom */

/**
 * Nano Banana 2.1 のモデル選択 UI(nano-banana-2-1 計画書 Phase 5)。
 *
 * - モデル行: 運営(useNanoBanana21Available が true)にだけ「Nano Banana 2.1」の行を出す
 * - 品質: 2.1 を選択中だけ品質(Low / Medium / High = minimal / medium / high)を出す
 * - サイズ: 2.1 は 1K / 2K / 4K。4K は Pro の「最大 5504px」を流用しない
 */

import { useTranslations } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { LockableModelSelect } from "@/features/generation/components/LockableModelSelect";
import { NanoBanana21QualitySelector } from "@/features/generation/components/NanoBanana21QualitySelector";
import { GeminiBananaSizeSelector } from "@/features/generation/components/GeminiBananaSizeSelector";
import { useNanoBanana21Available } from "@/features/generation/components/NanoBanana21AvailabilityProvider";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/generation/components/NanoBanana21AvailabilityProvider", () => ({
  useNanoBanana21Available: jest.fn(() => false),
}));

jest.mock("@/components/ui/select", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div data-testid="select" data-value={value}>
          {children}
        </div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const context = React.useContext(SelectContext);
      return (
        <button
          type="button"
          data-option={value}
          onClick={() => context.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <span>{children}</span>
    ),
    SelectValue: () => <span data-testid="select-value" />,
  };
});

// Gemini の kill switch はモジュール読み込み時に env を読むので、Gemini を有効にした
// 経路を見るために model-config をモックする(gemini-banana-size-selector.test と同じ)。
// resolveEffectiveModelForAuthState は同じモジュールの中で kill switch を見るため、
// 2.1 の段階公開の丸めだけを再現する。
jest.mock("@/features/generation/lib/model-config", () => {
  const actual = jest.requireActual<
    typeof import("@/features/generation/lib/model-config")
  >("@/features/generation/lib/model-config");
  const shared = jest.requireActual<
    typeof import("@/shared/generation/gemini-banana-model")
  >("@/shared/generation/gemini-banana-model");
  return {
    ...actual,
    isModelAvailableForGeneration: jest.fn(() => true),
    isCanonicalGuestAllowedModel: jest.fn(
      (model: string | null | undefined) => model === "gpt-image-2-low-1k"
    ),
    resolveEffectiveModelForAuthState: jest.fn(
      (
        model: string,
        _authState: string,
        options: { nanoBanana21Available?: boolean } = {}
      ) =>
        shared.isNanoBanana21Model(model) && !options.nanoBanana21Available
          ? "gpt-image-2-low-1k"
          : model
    ),
  };
});

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useNanoBanana21AvailableMock = useNanoBanana21Available as jest.MockedFunction<
  typeof useNanoBanana21Available
>;

const labels: Record<string, string> = {
  modelChatGptImages: "ChatGPT Images 2.0",
  modelChatGptImages25: "ChatGPT Images 2.5",
  modelNanoBanana2: "Nano Banana 2",
  modelNanoBanana21: "Nano Banana 2.1",
  modelNanoBananaPro: "Nano Banana Pro",
  modelTagEngineOpenai: "OpenAI",
  modelTagEngineGemini: "Gemini",
  modelTagTierLight: "Low",
  modelTagTierBalanced: "Medium",
  modelTagTierQuality: "High",
  nanoBanana21QualityLabel: "品質",
  nanoBanana21QualityLow: "素早く生成",
  nanoBanana21QualityMedium: "バランス良く生成",
  nanoBanana21QualityHigh: "丁寧に生成",
  geminiBananaSizeLabel: "出力サイズを選択",
  geminiBananaSize05k: "0.5K",
  geminiBananaSize1k: "1K",
  geminiBananaSize2k: "2K",
  geminiBananaSize4k: "最大5504px",
  nanoBanana21Size4k: "約4800px",
  geminiBanana2SizeTooltipContent: "nano2-size-tooltip",
  geminiBananaProSizeTooltipContent: "pro-size-tooltip",
  nanoBanana21SizeTooltipContent: "nano21-size-tooltip",
};

beforeEach(() => {
  useTranslationsMock.mockImplementation(() => {
    return ((key: string) => labels[key] ?? key) as ReturnType<
      typeof useTranslations
    >;
  });
  useNanoBanana21AvailableMock.mockReturnValue(false);
});

afterEach(() => {
  jest.clearAllMocks();
});

function renderModelSelect(value: string, onChange = jest.fn()) {
  render(
    <LockableModelSelect
      value={value as never}
      authState="authenticated"
      onChange={onChange}
      onLockedClick={jest.fn()}
    />
  );
  return onChange;
}

describe("LockableModelSelect の Nano Banana 2.1 の行", () => {
  test("運営でなければ 2.1 の行を出さない(REQ-001 と同じ段階公開)", () => {
    renderModelSelect("gemini-3.1-flash-image-preview-1024");

    expect(screen.queryByText("Nano Banana 2.1")).not.toBeInTheDocument();
    expect(screen.getByText("Nano Banana 2")).toBeInTheDocument();
  });

  test("運営には Nano Banana 2 のすぐ下に 2.1 の行を出す", () => {
    useNanoBanana21AvailableMock.mockReturnValue(true);
    renderModelSelect("gemini-3.1-flash-image-preview-1024");

    const rows = Array.from(document.querySelectorAll("[data-option]")).map(
      (el) => el.getAttribute("data-option")
    );
    expect(rows.indexOf("nano-banana-2.1-row")).toBe(
      rows.indexOf("nano-banana-2-row") + 1
    );
  });

  test("2.1 の行を選ぶと、品質は Low(minimal)・今のサイズが使えればそのまま(REQ-003)", () => {
    useNanoBanana21AvailableMock.mockReturnValue(true);
    const onChange = renderModelSelect("gemini-3-pro-image-4k");

    fireEvent.click(screen.getByText("Nano Banana 2.1"));

    expect(onChange).toHaveBeenCalledWith("gemini-nano-banana-2.1-minimal-4k");
  });

  test("2.1 に無いサイズ(0.5K)からは 1K に落とす", () => {
    useNanoBanana21AvailableMock.mockReturnValue(true);
    const onChange = renderModelSelect("gemini-3.1-flash-image-preview-512");

    fireEvent.click(screen.getByText("Nano Banana 2.1"));

    expect(onChange).toHaveBeenCalledWith("gemini-nano-banana-2.1-minimal-1k");
  });

  test("2.1 を選択中に 2.1 の行を選んでも、品質とサイズを保つ", () => {
    useNanoBanana21AvailableMock.mockReturnValue(true);
    const onChange = renderModelSelect("gemini-nano-banana-2.1-high-2k");

    fireEvent.click(screen.getByText("Nano Banana 2.1"));

    expect(onChange).toHaveBeenCalledWith("gemini-nano-banana-2.1-high-2k");
    expect(screen.getAllByTestId("select")[0]).toHaveAttribute(
      "data-value",
      "nano-banana-2.1-row"
    );
  });

  test("2.1 から Pro に切り替えると、サイズを引き継ぐ", () => {
    useNanoBanana21AvailableMock.mockReturnValue(true);
    const onChange = renderModelSelect("gemini-nano-banana-2.1-medium-2k");

    fireEvent.click(screen.getByText("Nano Banana Pro"));

    expect(onChange).toHaveBeenCalledWith("gemini-3-pro-image-2k");
  });

  test("運営でない人の端末に 2.1 が保存されていても、表示は既定のモデルに丸める(REQ-016)", () => {
    renderModelSelect("gemini-nano-banana-2.1-high-2k");

    expect(screen.getAllByTestId("select")[0]).toHaveAttribute(
      "data-value",
      "gpt-image-2-row"
    );
  });
});

describe("NanoBanana21QualitySelector", () => {
  function renderQuality(value: string, onChange = jest.fn()) {
    render(
      <NanoBanana21QualitySelector
        value={value as never}
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );
    return onChange;
  }

  test("2.1 以外を選択中は何も描画しない", () => {
    renderQuality("gemini-3.1-flash-image-preview-1024");
    expect(screen.queryByText("品質")).not.toBeInTheDocument();
    renderQuality("gpt-image-2-low-1k");
    expect(screen.queryByText("品質")).not.toBeInTheDocument();
  });

  test("3 段の品質を tier チップつきで出し、今の考える量を選んでいる", () => {
    renderQuality("gemini-nano-banana-2.1-medium-1k");

    expect(screen.getByText("品質")).toBeInTheDocument();
    expect(screen.getByText("素早く生成")).toBeInTheDocument();
    expect(screen.getByText("バランス良く生成")).toBeInTheDocument();
    expect(screen.getByText("丁寧に生成")).toBeInTheDocument();
    expect(screen.getByTestId("select")).toHaveAttribute("data-value", "medium");
  });

  test("品質を変えてもサイズは保つ", () => {
    const onChange = renderQuality("gemini-nano-banana-2.1-minimal-4k");

    fireEvent.click(screen.getByText("丁寧に生成"));

    expect(onChange).toHaveBeenCalledWith("gemini-nano-banana-2.1-high-4k");
  });

  test("プランで選べない品質は、選ばずに案内を開く", () => {
    const onLockedClick = jest.fn();
    const onChange = jest.fn();
    render(
      <NanoBanana21QualitySelector
        value={"gemini-nano-banana-2.1-minimal-1k" as never}
        authState="authenticated"
        onChange={onChange}
        onLockedClick={onLockedClick}
        isModelSelectable={(model) => model !== "gemini-nano-banana-2.1-high-1k"}
      />
    );

    fireEvent.click(screen.getByText("丁寧に生成"));

    expect(onChange).not.toHaveBeenCalled();
    expect(onLockedClick).toHaveBeenCalledTimes(1);
  });
});

describe("GeminiBananaSizeSelector の Nano Banana 2.1", () => {
  function renderSize(value: string, onChange = jest.fn()) {
    render(
      <GeminiBananaSizeSelector
        value={value as never}
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );
    return onChange;
  }

  test("2.1 は 1K / 2K / 4K を出し、4K は 2.1 の文言(約4800px)にする", () => {
    renderSize("gemini-nano-banana-2.1-medium-1k");

    const options = Array.from(document.querySelectorAll("[data-option]")).map(
      (el) => el.getAttribute("data-option")
    );
    expect(options).toEqual(["1k", "2k", "4k"]);
    expect(screen.getByText("約4800px")).toBeInTheDocument();
    expect(screen.queryByText("最大5504px")).not.toBeInTheDocument();
  });

  test("サイズを変えても考える量は保つ", () => {
    const onChange = renderSize("gemini-nano-banana-2.1-high-1k");

    fireEvent.click(screen.getByText("2K"));

    expect(onChange).toHaveBeenCalledWith("gemini-nano-banana-2.1-high-2k");
  });

  test("Pro の 4K は今までどおり Pro の文言のまま", () => {
    renderSize("gemini-3-pro-image-1k");

    expect(screen.getByText("最大5504px")).toBeInTheDocument();
    expect(screen.queryByText("約4800px")).not.toBeInTheDocument();
  });
});
