/** @jest-environment jsdom */

import { useTranslations } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { LockableModelSelect } from "@/features/generation/components/LockableModelSelect";

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

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

const labels: Record<string, string> = {
  modelLight05k: "Nano Banana 2 0.5K",
  modelGptImage2Low: "ChatGPT Images 2.0 Low",
  modelGptImage2Medium: "ChatGPT Images 2.0 Medium",
  modelGptImage2High: "ChatGPT Images 2.0 High",
  modelStandard1k: "Nano Banana 2 1K",
  modelPro1k: "Nano Banana Pro 1K",
  modelPro2k: "Nano Banana Pro 2K",
  modelPro4k: "Nano Banana Pro 4K",
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

describe("LockableModelSelect interactions", () => {
  test("Gemini 停止中は OpenAI 品質行のみ表示し、Gemini 系モデルを表示しない", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Nano Banana/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0 Low/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0 Medium/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0 High/ })
    ).toBeInTheDocument();
  });

  test("Gemini 停止中でもゲストの高品質 OpenAI 行はロッククリック導線になる", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Nano Banana Pro 1K/ })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /ChatGPT Images 2.0 Medium/ })
    );

    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("guest が許可モデルを選ぶと onChange を呼ぶ", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0 Low/ })
    );

    expect(onChange).toHaveBeenCalledWith("gpt-image-2-low-1k");
    expect(onLockedClick).not.toHaveBeenCalled();
  });

  test("authenticated が品質を変えると現在の size tier を保持する", () => {
    const onChange = jest.fn();
    render(
      <LockableModelSelect
        value="gpt-image-2-low-4k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0 High/ })
    );

    expect(onChange).toHaveBeenCalledWith("gpt-image-2-high-4k");
  });

  test("追加の許可判定で不許可の品質行を表示しない", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-4k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
        isModelSelectable={(model) => model !== "gpt-image-2-high-4k"}
      />
    );

    expect(
      screen.queryByRole("button", { name: /ChatGPT Images 2\.0 High/ })
    ).not.toBeInTheDocument();
  });

  test("各モデル行に Low / Medium / High の色付きチップを表示する", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    const lowRow = screen.getByRole("button", {
      name: /ChatGPT Images 2\.0 Low/,
    });
    expect(lowRow).toHaveTextContent("Low");

    const mediumRow = screen.getByRole("button", {
      name: /ChatGPT Images 2\.0 Medium/,
    });
    expect(mediumRow).toHaveTextContent("Medium");

    const highRow = screen.getByRole("button", {
      name: /ChatGPT Images 2\.0 High/,
    });
    expect(highRow).toHaveTextContent("High");
  });
});
