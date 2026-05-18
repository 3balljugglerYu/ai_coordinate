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
  modelChatGptImages: "ChatGPT Images 2.0",
  modelNanoBanana2: "Nano Banana 2",
  modelNanoBananaPro: "Nano Banana Pro",
  modelTagEngineOpenai: "OpenAI",
  modelTagEngineGemini: "Gemini",
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
  test("authenticated 時は trigger に選択中ファミリーのラベル（ChatGPT Images 2.0）を表示する", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    expect(screen.getByText("ChatGPT Images 2.0")).toBeInTheDocument();
  });

  test("guest 時に許可外モデルが渡されても表示は DEFAULT_GENERATION_MODEL のファミリーに丸める", () => {
    render(
      <LockableModelSelect
        value="gemini-3-pro-image-2k"
        authState="guest"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    // 表示は ChatGPT Images 2.0（DEFAULT_GENERATION_MODEL のファミリー）
    expect(screen.getByText("ChatGPT Images 2.0")).toBeInTheDocument();
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
    expect(screen.getByText("ChatGPT Images 2.0")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  test("trigger に選択中ファミリーのエンジンチップ（[OpenAI]）を表示する", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("ChatGPT Images 2.0");
    expect(trigger).toHaveTextContent("OpenAI");
  });

  // 注: dropdown を開いて行をクリックする統合テストは Radix Select の pointer 動作が
  // jsdom 上で不安定なため、ここではスキップ。実機/ブラウザ E2E で担保する。
});
