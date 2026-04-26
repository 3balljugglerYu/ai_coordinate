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
  modelGptImage2Low: "ChatGPT Images 2.0",
  modelStandard1k: "Nano Banana 2 1K",
  modelPro1k: "Nano Banana Pro 1K",
  modelPro2k: "Nano Banana Pro 2K",
  modelPro4k: "Nano Banana Pro 4K",
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
  test("guest がロックモデルを選ぶと onLockedClick だけを呼ぶ", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <LockableModelSelect
        value="gpt-image-2-low"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Nano Banana Pro 1K/ }));

    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("guest が許可モデルを選ぶと onChange を呼ぶ", () => {
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    render(
      <LockableModelSelect
        value="gpt-image-2-low"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Nano Banana 2 0.5K" }));

    expect(onChange).toHaveBeenCalledWith("gemini-3.1-flash-image-preview-512");
    expect(onLockedClick).not.toHaveBeenCalled();
  });
});
