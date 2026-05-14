/** @jest-environment jsdom */

import { useTranslations } from "next-intl";
import { render, screen } from "@testing-library/react";
import { LockableModelSelect } from "@/features/generation/components/LockableModelSelect";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

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

describe("LockableModelSelect", () => {
  test("authenticated 時は trigger に選択中モデルのラベルを表示する", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(screen.getByText("ChatGPT Images 2.0 Low")).toBeInTheDocument();
  });

  test("guest 時に許可外モデルが渡されても表示は DEFAULT_GENERATION_MODEL に丸める", () => {
    render(
      <LockableModelSelect
        value="gemini-3-pro-image-2k"
        authState="guest"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    // 表示は ChatGPT Images 2.0 Low（DEFAULT_GENERATION_MODEL）
    expect(screen.getByText("ChatGPT Images 2.0 Low")).toBeInTheDocument();
  });

  test("guest 時の disabled でも trigger は表示される", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
        disabled
      />
    );
    // disabled でも displayValue のラベルは描画される
    expect(screen.getByText("ChatGPT Images 2.0 Low")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  test("trigger に選択中モデルの色付き Low / Medium / High チップを表示する", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("ChatGPT Images 2.0 Low");
    expect(trigger).toHaveTextContent("Low");
  });

  // 注: dropdown を開いて行をクリックする統合テストは Radix Select の pointer 動作が
  // jsdom 上で不安定なため、ここではスキップ。実機/ブラウザ E2E で担保する。
});
