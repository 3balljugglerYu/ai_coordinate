/** @jest-environment jsdom */

import { useTranslations } from "next-intl";
import { fireEvent, render, screen } from "@testing-library/react";
import { LockableModelSelect } from "@/features/generation/components/LockableModelSelect";
import {
  GptImage25AvailabilityProvider,
  GptImage25AvailabilityUpgrade,
} from "@/features/generation/components/GptImage25AvailabilityProvider";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

// Radix の Select はポータル描画で行を掴みにくいため、
// lockable-model-select-interaction.test.tsx と同じ形で差し替える。
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
  modelChatGptImages25: "ChatGPT Images 2.5",
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

/** 運営（サーバー側で可否が true に昇格した状態）を再現する。 */
function renderAsAdmin(ui: React.ReactElement) {
  return render(
    <GptImage25AvailabilityProvider>
      <GptImage25AvailabilityUpgrade />
      {ui}
    </GptImage25AvailabilityProvider>
  );
}

describe("ChatGPT Images 2.5 の行（段階公開 / REQ-001・REQ-002）", () => {
  test("Provider の外（＝非運営・フラグ OFF）では 2.5 の行を出さない", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /ChatGPT Images 2\.5/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0/ })
    ).toBeInTheDocument();
  });

  test("運営には 2.5 の行が出る", () => {
    renderAsAdmin(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /ChatGPT Images 2\.5/ })
    ).toBeInTheDocument();
  });

  test("2.5 の行にも [OpenAI] エンジンチップを添える", () => {
    renderAsAdmin(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    const row = screen.getByRole("button", { name: /ChatGPT Images 2\.5/ });
    expect(row).toHaveTextContent("OpenAI");
  });

  test("2.0 → 2.5 の行クリックで size を維持し quality は low になる（REQ-003）", () => {
    const onChange = jest.fn();
    renderAsAdmin(
      <LockableModelSelect
        value="gpt-image-2-high-4k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT Images 2\.5/ }));
    expect(onChange).toHaveBeenCalledWith("gpt-image-2.5-flare-low-4k");
  });

  test("2.5 を選択中に 2.5 の行をクリックしても canonical を維持する", () => {
    const onChange = jest.fn();
    renderAsAdmin(
      <LockableModelSelect
        value="gpt-image-2.5-flare-medium-2k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT Images 2\.5/ }));
    expect(onChange).toHaveBeenCalledWith("gpt-image-2.5-flare-medium-2k");
  });

  test("2.5 → 2.0 の行クリックでも size を維持する", () => {
    const onChange = jest.fn();
    renderAsAdmin(
      <LockableModelSelect
        value="gpt-image-2.5-flare-high-2k"
        authState="authenticated"
        onChange={onChange}
        onLockedClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT Images 2\.0/ }));
    expect(onChange).toHaveBeenCalledWith("gpt-image-2-low-2k");
  });

  test("ゲストには 2.5 が見えても南京錠になり、クリックで onLockedClick に飛ぶ", () => {
    // GUEST_ALLOWED_MODELS に 2.5 は入れていない（Phase 3 の決定）。
    const onChange = jest.fn();
    const onLockedClick = jest.fn();
    renderAsAdmin(
      <LockableModelSelect
        value="gpt-image-2-low-1k"
        authState="guest"
        onChange={onChange}
        onLockedClick={onLockedClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /ChatGPT Images 2\.5/ }));
    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("非運営に 2.5 の値が渡っても、表示は 2.0 の行へ丸める（REQ-014）", () => {
    render(
      <LockableModelSelect
        value="gpt-image-2.5-flare-low-1k"
        authState="authenticated"
        onChange={jest.fn()}
        onLockedClick={jest.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /ChatGPT Images 2\.5/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ChatGPT Images 2\.0/ })
    ).toBeInTheDocument();
  });
});
