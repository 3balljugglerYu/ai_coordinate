/** @jest-environment jsdom */

import { useTranslations } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { GptImage2SizeSelector } from "@/features/generation/components/GptImage2SizeSelector";
import { isModelAvailableForGeneration } from "@/features/generation/lib/model-config";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

// isModelAvailableForGeneration を必要に応じてモックできるよう partial mock。
// 既定は実装どおり（GPT 系は常に true）。
jest.mock("@/features/generation/lib/model-config", () => {
  const actual = jest.requireActual<typeof import("@/features/generation/lib/model-config")>(
    "@/features/generation/lib/model-config"
  );
  return {
    ...actual,
    isModelAvailableForGeneration: jest.fn(actual.isModelAvailableForGeneration),
  };
});

const isModelAvailableForGenerationMock =
  isModelAvailableForGeneration as jest.MockedFunction<
    typeof isModelAvailableForGeneration
  >;

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

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

const labels: Record<string, string> = {
  gptImage2SizeLabel: "Output size",
  gptImage2SizeDescription: "Choose the GPT Image 2 output size.",
  gptImage2Size1k: "1K",
  gptImage2Size2k: "2K",
  gptImage2Size4k: "4K",
  gptImage2SizePricePerImage: "{cost} Percoins / image",
};

beforeEach(() => {
  useTranslationsMock.mockImplementation(() => {
    return ((key: string, values?: Record<string, unknown>) => {
      const template = labels[key] ?? key;
      return template.replace("{cost}", String(values?.cost ?? "{cost}"));
    }) as ReturnType<typeof useTranslations>;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("GptImage2SizeSelector", () => {
  test("GPT Image 2 以外では表示しない", () => {
    const { container } = render(
      <GptImage2SizeSelector
        value="gemini-3-pro-image-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("authenticated は quality を保持したまま size tier を合成する", () => {
    const onChange = jest.fn();
    render(
      <GptImage2SizeSelector
        value="gpt-image-2-medium-1k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /4K/ }));

    expect(onChange).toHaveBeenCalledWith("gpt-image-2-medium-4k");
  });

  test("size tier ラベル（1K / 2K / 4K）が並ぶ", () => {
    // 759e2ab で per-option の percoin cost 表示はツールチップに移動され、
    // セレクタ自体は tier ラベルのみを描画する。価格情報は tooltip 経由で参照する。
    render(
      <GptImage2SizeSelector
        value="gpt-image-2-high-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^1K$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2K$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^4K$/ })).toBeInTheDocument();
  });

  test("guest が 1k 以外を選ぶと変更せずロック導線を呼ぶ", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <GptImage2SizeSelector
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /2K/ }));

    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("追加の許可判定で不許可の size tier は変更しない", () => {
    const onChange = jest.fn();
    render(
      <GptImage2SizeSelector
        value="gpt-image-2-high-1k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
        isModelSelectable={(model) => model !== "gpt-image-2-high-4k"}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /4K/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  test("isModelAvailableForGeneration が false の場合は onChange も onLockedClick も呼ばない（防御ガード）", () => {
    // 通常 GPT モデルは常に available だが、kill switch 等で一時的に false を
    // 返すケースを想定した防御ガード。onChange / onLockedClick 双方発火しない。
    isModelAvailableForGenerationMock.mockImplementation((model) =>
      model !== "gpt-image-2-low-4k"
    );

    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <GptImage2SizeSelector
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /4K/ }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onLockedClick).not.toHaveBeenCalled();
  });
});
