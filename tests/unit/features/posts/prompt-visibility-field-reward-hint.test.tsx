/**
 * PromptVisibilityField の「公開する」説明文が、クリエイター還元の有無で
 * 切り替わることを固定する。
 *
 * 還元は admin で 0（停止）にできるため、停止中に「ペルコイン還元にも
 * 含まれません」と書くと、存在しない機能を前提にした文章になる。
 * 他の告知と同じく「0 なら還元に触れない」で統一する。
 */
import { render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PromptVisibilityField } from "@/features/posts/components/PromptVisibilityField";
import { useUsageRewardAmounts } from "@/features/credits/hooks/useUsageRewardAmounts";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/credits/hooks/useUsageRewardAmounts", () => ({
  useUsageRewardAmounts: jest.fn(),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useUsageRewardAmountsMock = useUsageRewardAmounts as jest.MockedFunction<
  typeof useUsageRewardAmounts
>;

const messages: Record<string, string> = {
  promptVisibilityLabel: "プロンプトの公開設定",
  promptVisibilityPublicOption: "プロンプトを公開する",
  promptVisibilityPrivateOption: "プロンプトを非公開にする",
  promptVisibilityPublicHint:
    "フォロワーはプロンプトをコピーできます。コピーから作られた分は利用数に入りません。",
  promptVisibilityPublicHintWithReward:
    "フォロワーはプロンプトをコピーできます。コピーから作られた分は、利用数にもペルコイン還元にも含まれません。",
  promptVisibilityPrivateHint: "プロンプトは誰にも見せません。",
  promptVisibilityRewardHint:
    "あなたをフォローしている人がこのプロンプトで生成すると、1回につき +{amount} ペルコインが還元されます。",
};

function translate(
  key: string,
  values?: Record<string, string | number>
): string {
  const template = messages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, token: string) =>
    values && token in values ? String(values[token]) : `{${token}}`
  );
}

function renderField() {
  return render(
    <PromptVisibilityField
      value="public"
      onChange={jest.fn()}
      idPrefix="test"
    />
  );
}

describe("PromptVisibilityField の還元まわりの表示", () => {
  beforeEach(() => {
    useTranslationsMock.mockImplementation(
      () =>
        ((key: string, values?: Record<string, string | number>) =>
          translate(key, values)) as ReturnType<typeof useTranslations>
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("還元が停止中(0)なら、還元の案内も還元に触れた説明文も出さない", () => {
    useUsageRewardAmountsMock.mockReturnValue({
      promptUsageRewardAmount: 0,
      styleUsageRewardAmount: 0,
    });

    renderField();

    expect(
      screen.getByText(
        "フォロワーはプロンプトをコピーできます。コピーから作られた分は利用数に入りません。"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/ペルコイン還元/)).not.toBeInTheDocument();
    expect(screen.queryByText(/還元されます/)).not.toBeInTheDocument();
  });

  test("還元が有効なら、案内を出し説明文も還元込みに切り替わる", () => {
    useUsageRewardAmountsMock.mockReturnValue({
      promptUsageRewardAmount: 2,
      styleUsageRewardAmount: 3,
    });

    renderField();

    expect(
      screen.getByText(
        "フォロワーはプロンプトをコピーできます。コピーから作られた分は、利用数にもペルコイン還元にも含まれません。"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "あなたをフォローしている人がこのプロンプトで生成すると、1回につき +2 ペルコインが還元されます。"
      )
    ).toBeInTheDocument();
  });
});
