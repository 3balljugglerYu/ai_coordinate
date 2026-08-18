import { render, screen } from "@testing-library/react";
import { PostBonusModal } from "@/features/posts/components/PostBonusModal";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      postBonusTitle: "ミッションクリア！",
      postBonusAmount: `+${values?.amount}`,
      postBonusUnit: "ペルコイン",
      postBonusMissionOneTap: "One-Tap Style で投稿！",
      postBonusMissionFree: "Free Style で生成して投稿！",
      postBonusMissionPromptUse: "プロンプトを利用して投稿！",
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

describe("PostBonusModal（どのミッションを達成したか）", () => {
  test("他の人のプロンプトで作った投稿では利用ミッションの見出しを出す", () => {
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
    expect(screen.getByText("ミッションクリア！")).toBeInTheDocument();
    expect(screen.getByText("プロンプトを利用して投稿！")).toBeInTheDocument();
    // 自分で書いたフリー投稿の見出しは出さない(達成した行が1つに定まる)
    expect(
      screen.queryByText("Free Style で生成して投稿！")
    ).not.toBeInTheDocument();
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
    expect(screen.getByText("Free Style で生成して投稿！")).toBeInTheDocument();
  });

  test("ワンタップ投稿ではワンタップの見出しを出す", () => {
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="one_tap_style"
        promptUsageRewardAmount={2}
      />
    );

    expect(screen.getByText("One-Tap Style で投稿！")).toBeInTheDocument();
    // ワンタップでは還元の案内を出さない(利用還元は現在0で未有効)
    expect(screen.queryByText("作者に2")).not.toBeInTheDocument();
  });

  test("対象外の生成方法では見出しを出さない", () => {
    render(
      <PostBonusModal
        open
        onOpenChange={() => {}}
        amount={20}
        generationType="coordinate"
        promptUsageRewardAmount={2}
      />
    );

    expect(screen.getByText("ミッションクリア！")).toBeInTheDocument();
    expect(
      screen.queryByText("One-Tap Style で投稿！")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Free Style で生成して投稿！")
    ).not.toBeInTheDocument();
  });
});
