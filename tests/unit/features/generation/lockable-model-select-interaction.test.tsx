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
  modelChatGptImages: "ChatGPT Images 2.0",
  modelNanoBanana2: "Nano Banana 2",
  modelNanoBananaPro: "Nano Banana Pro",
  modelTagEngineOpenai: "OpenAI",
  modelTagEngineGemini: "Gemini",
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
  test("Gemini 停止中は ChatGPT Images 2.0 の 1 行のみ表示する", () => {
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
      screen.getByRole("button", { name: /ChatGPT Images 2\.0/ })
    ).toBeInTheDocument();
  });

  test("guest が ChatGPT 行をクリックすると現在の canonical を維持して onChange を呼ぶ", () => {
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
      screen.getByRole("button", { name: /ChatGPT Images 2\.0/ })
    );

    // 同じファミリー（gpt-image-2）の行クリックは canonical を維持する
    expect(onChange).toHaveBeenCalledWith("gpt-image-2-low-1k");
    expect(onLockedClick).not.toHaveBeenCalled();
  });

  test("isModelSelectable で ChatGPT も除外すると行が消える", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
        isModelSelectable={() => false}
      />
    );

    expect(
      screen.queryByRole("button", { name: /ChatGPT Images 2\.0/ })
    ).not.toBeInTheDocument();
  });

  test("ChatGPT 行に [OpenAI] エンジンチップを表示する", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    const row = screen.getByRole("button", { name: /ChatGPT Images 2\.0/ });
    expect(row).toHaveTextContent("OpenAI");
  });
});
