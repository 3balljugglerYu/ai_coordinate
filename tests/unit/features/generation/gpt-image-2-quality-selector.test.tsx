/** @jest-environment jsdom */

import { useTranslations } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { GptImage2QualitySelector } from "@/features/generation/components/GptImage2QualitySelector";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/components/ui/select", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange?: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div>{children}</div>
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
        <button type="button" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <button type="button">{children}</button>
    ),
    SelectValue: () => <span data-testid="select-value" />,
  };
});

// LabelInfoTooltip は Radix Popover を使うため jsdom で煩雑。挙動はここでは検証対象外。
jest.mock("@/components/LabelInfoTooltip", () => ({
  LabelInfoTooltip: () => null,
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

const labels: Record<string, string> = {
  gptImage2QualityLabel: "Generation type",
  gptImage2QualityLow: "Generate quickly",
  gptImage2QualityMedium: "Generate balanced",
  gptImage2QualityHigh: "Generate carefully",
  modelTooltipAria: "Show how the models differ",
  modelTooltipContent: "",
  modelTagTierLight: "Low",
  modelTagTierBalanced: "Medium",
  modelTagTierQuality: "High",
};

beforeEach(() => {
  useTranslationsMock.mockImplementation(() => {
    return ((key: string) => labels[key] ?? key) as ReturnType<
      typeof useTranslations
    >;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("GptImage2QualitySelector", () => {
  test("ChatGPT 系以外（Gemini 等）では描画しない", () => {
    const { container } = render(
      <GptImage2QualitySelector
        value="gemini-3-pro-image-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("3 行に「素早く生成 / バランスよく生成 / 丁寧に生成」相当のラベルを出す", () => {
    render(
      <GptImage2QualitySelector
        value="gpt-image-2-medium-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /Generate quickly/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate balanced/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate carefully/ })
    ).toBeInTheDocument();
  });

  test("authenticated は size tier を保持したまま quality を合成する", () => {
    const onChange = jest.fn();
    render(
      <GptImage2QualitySelector
        value="gpt-image-2-low-4k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Generate carefully/ }));
    expect(onChange).toHaveBeenCalledWith("gpt-image-2-high-4k");
  });

  test("各行に行ラベルと色付き tier チップを並べて表示する", () => {
    render(
      <GptImage2QualitySelector
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    const low = screen.getByRole("button", { name: /Generate quickly/ });
    expect(low).toHaveTextContent("Low"); // tier チップ側のテキスト
    const high = screen.getByRole("button", { name: /Generate carefully/ });
    expect(high).toHaveTextContent("High");
  });

  test("guest が medium / high を選ぶと onLockedClick を呼び onChange は呼ばない", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <GptImage2QualitySelector
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Generate balanced/ }));
    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
