import { render, screen } from "@testing-library/react";
import { PostBonusModal } from "@/features/posts/components/PostBonusModal";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      postBonusTitle: "ボーナス獲得",
      postBonusAmount: `+${values?.amount}`,
      postBonusUnit: "ペルコイン",
      postBonusBreakdownPost: "投稿ボーナス",
      postBonusBreakdownPromptUse: "他の人のプロンプトで作った",
      postBonusCreatorReward: `作者に${values?.amount}`,
      postBonusPrivateNote: "非公開でも使ってもらえます",
      postBonusCreatorRewardLink: "くわしく",
      postBonusClose: "とじる",
    };
    return dict[key] ?? key;
  },
}));

jest.mock("@/features/collections/components/CountUpNumber", () => ({
  CountUpNumber: ({ value }: { value: number }) => (
    <span data-testid="count-up">{value}</span>
  ),
}));
jest.mock("@/features/challenges/components/RewardBurst", () => ({
  RewardBurst: () => null,
}));

describe("PostBonusModal の内訳表示", () => {
  test("他の人のプロンプトで作ったときは合計を出し、内訳も並べる", () => {
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="free"
        promptUsageRewardAmount={0}
        promptUseBonusAmount={20}
      />
    );

    // 大きな数字は合計。別々にアニメーションさせると総額が分からなくなる
    expect(screen.getByTestId("count-up")).toHaveTextContent("40");
    expect(screen.getByText("投稿ボーナス")).toBeInTheDocument();
    expect(screen.getByText("他の人のプロンプトで作った")).toBeInTheDocument();
  });

  test("上乗せが無いときは内訳を出さない(いつもの投稿と同じ見た目)", () => {
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="free"
        promptUsageRewardAmount={0}
      />
    );

    expect(screen.getByTestId("count-up")).toHaveTextContent("20");
    expect(screen.queryByText("投稿ボーナス")).not.toBeInTheDocument();
  });

  test("上乗せだけのときも合計として出せる", () => {
    // その日2回目の投稿で投稿ボーナスが 0 でも、上乗せは受け取れる
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={0}
        generationType="free"
        promptUsageRewardAmount={0}
        promptUseBonusAmount={20}
      />
    );

    expect(screen.getByTestId("count-up")).toHaveTextContent("20");
  });
});
