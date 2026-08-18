import { render, screen } from "@testing-library/react";
import { PromptUseBonusModal } from "@/features/credits/components/PromptUseBonusModal";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      promptUseBonusTitle: "プロンプトを使いました！",
      promptUseBonusAmount: `+${values?.amount} ペルコイン`,
      promptUseBonusUnit: "ペルコイン",
      promptUseBonusBody: "1日1回もらえます。自分のプロンプトは対象外です。",
      promptUseBonusClose: "つづける",
    };
    return dict[key] ?? key;
  },
}));

// アニメーションは値の到達だけ検証したいので、最終値を即出す実装に差し替える
jest.mock("@/features/collections/components/CountUpNumber", () => ({
  CountUpNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));
jest.mock("@/features/challenges/components/RewardBurst", () => ({
  RewardBurst: () => null,
}));

describe("PromptUseBonusModal", () => {
  test("付与額と、1日1回・自己利用除外の注記を出す", () => {
    render(
      <PromptUseBonusModal open onOpenChange={() => {}} amount={20} />
    );

    expect(screen.getByText("20")).toBeInTheDocument();
    // 歯止めを利用者にも見えるようにしておく(実装だけに持たせない)
    expect(
      screen.getByText("1日1回もらえます。自分のプロンプトは対象外です。")
    ).toBeInTheDocument();
  });

  test("閉じているときは何も描かない", () => {
    render(
      <PromptUseBonusModal open={false} onOpenChange={() => {}} amount={20} />
    );

    expect(screen.queryByText("20")).not.toBeInTheDocument();
  });
});
