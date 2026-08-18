import { render, screen } from "@testing-library/react";
import { PostBonusModal } from "@/features/posts/components/PostBonusModal";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      postBonusTitle: "ボーナス獲得",
      postBonusAmount: `+${values?.amount}`,
      postBonusUnit: "ペルコイン",
      postBonusPromptUseNote: "他の人のプロンプトで作った投稿としてカウントされました",
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

describe("PostBonusModal（他の人のプロンプトで作った投稿）", () => {
  test("どちらのミッションで受け取ったかを伝える", () => {
    // 「フリースタイルで投稿」とは排他なので、額は常に片方ぶん(20)
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="free"
        promptUsageRewardAmount={2}
        isPromptUse
      />
    );

    expect(screen.getByTestId("count-up")).toHaveTextContent("20");
    expect(
      screen.getByText("他の人のプロンプトで作った投稿としてカウントされました")
    ).toBeInTheDocument();
  });

  test("他の人のプロンプトで作った投稿では作者還元の案内を出さない", () => {
    // 原作者が別にいるのに「あなたのプロンプトが使われると還元」と出すと、
    // 自分の手柄のように読めてしまう
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="free"
        promptUsageRewardAmount={2}
        isPromptUse
      />
    );

    expect(screen.queryByText("作者に2")).not.toBeInTheDocument();
  });

  test("自分で書いたフリー投稿では従来どおり還元を案内する", () => {
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="free"
        promptUsageRewardAmount={2}
      />
    );

    expect(screen.getByText("作者に2")).toBeInTheDocument();
    expect(
      screen.queryByText("他の人のプロンプトで作った投稿としてカウントされました")
    ).not.toBeInTheDocument();
  });
});
