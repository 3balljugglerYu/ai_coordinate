/** @jest-environment jsdom */

import { useTranslations } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { GeminiBananaSizeSelector } from "@/features/generation/components/GeminiBananaSizeSelector";

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

// kill switch は process.env をモジュール load 時に評価するため、テスト時は
// Gemini を有効化したパスを検証するために model-config を直接モックする。
// gpt-image-2 用 (`gpt-image-2-size-selector.test.tsx`) は OpenAI 系のみ扱う都合上
// kill switch の影響を受けないので、こちらだけ専用にモックしている。
jest.mock("@/features/generation/lib/model-config", () => {
  const actual = jest.requireActual<typeof import("@/features/generation/lib/model-config")>(
    "@/features/generation/lib/model-config"
  );
  return {
    ...actual,
    isModelAvailableForGeneration: jest.fn(() => true),
    isCanonicalGuestAllowedModel: jest.fn((model: string | null | undefined) =>
      model === "gpt-image-2-low-1k" ||
      model === "gemini-3.1-flash-image-preview-512"
    ),
  };
});

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

const labels: Record<string, string> = {
  geminiBananaSizeLabel: "Output size",
  geminiBananaSizeDescription: "Higher resolution costs more Percoins.",
  geminiBananaSize05k: "0.5K",
  geminiBananaSize1k: "1K",
  geminiBananaSize2k: "2K",
  geminiBananaSize4k: "4K",
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

describe("GeminiBananaSizeSelector", () => {
  test("Nano Banana 系以外（OpenAI 等）では表示しない", () => {
    const { container } = render(
      <GeminiBananaSizeSelector
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("nano-2 を選択中は 0.5K / 1K のみを並べる", () => {
    render(
      <GeminiBananaSizeSelector
        value="gemini-3.1-flash-image-preview-1024"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /0\.5K/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^1K/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^2K/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^4K/ })
    ).not.toBeInTheDocument();
  });

  test("nano-pro を選択中は 1K / 2K / 4K を並べる", () => {
    render(
      <GeminiBananaSizeSelector
        value="gemini-3-pro-image-2k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^1K/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2K/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^4K/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /0\.5K/ })
    ).not.toBeInTheDocument();
  });

  test("authenticated は family を保持したまま size tier を合成する", () => {
    const onChange = jest.fn();
    render(
      <GeminiBananaSizeSelector
        value="gemini-3-pro-image-1k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^4K/ }));
    expect(onChange).toHaveBeenCalledWith("gemini-3-pro-image-4k");
  });

  test("size tier ごとの percoin cost を表示する（nano-pro）", () => {
    render(
      <GeminiBananaSizeSelector
        value="gemini-3-pro-image-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /1K.*50 Percoins/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2K.*80 Percoins/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /4K.*100 Percoins/ })
    ).toBeInTheDocument();
  });

  test("guest が許可されていない size を選ぶと onLockedClick を呼び、onChange は呼ばない", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <GeminiBananaSizeSelector
        value="gemini-3.1-flash-image-preview-512"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );
    // 1K (= gemini-3.1-flash-image-preview-1024) は guest 許可外なので、
    // クリックすると onLockedClick が呼ばれる
    fireEvent.click(screen.getByRole("button", { name: /^1K/ }));
    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("free プラン (isModelSelectable=false) でクリックすると onLockedClick を呼ぶ", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <GeminiBananaSizeSelector
        value="gemini-3-pro-image-1k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={onLockedClick}
        // 2K と 4K だけ free プラン的に不許可
        isModelSelectable={(model) => model === "gemini-3-pro-image-1k"}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^4K/ }));
    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("isModelAvailableForGeneration が false の場合は onChange / onLockedClick とも呼ばない（防御ガード）", () => {
    // kill switch などで一時的に false を返すケース。
    // 通常は Gemini が disabled な状態で発火する分岐。
    const { isModelAvailableForGeneration } = jest.requireMock(
      "@/features/generation/lib/model-config"
    ) as { isModelAvailableForGeneration: jest.Mock };
    isModelAvailableForGeneration.mockImplementation(
      (model: string) => model !== "gemini-3-pro-image-4k"
    );

    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <GeminiBananaSizeSelector
        value="gemini-3-pro-image-1k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^4K/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onLockedClick).not.toHaveBeenCalled();
  });
});
