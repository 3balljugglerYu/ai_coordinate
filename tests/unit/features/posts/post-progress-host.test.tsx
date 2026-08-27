/** @jest-environment jsdom */

/**
 * 投稿の「送信中」と「完了」を受け持つホスト。
 *
 * ⭐ 以前は投稿後に `window.location.href = "/"` でホームへフル遷移し、
 * ホームが付与モーダルを出していた。遷移をやめた結果、その受け皿が
 * ここへ移っている。投稿の入口は5か所あるので、各画面に同じ後始末を
 * 書かず、アプリに1つだけ置いたこのホストがまとめて出す。
 */

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { PostProgressHost } from "@/features/posts/components/PostProgressHost";
import {
  abortPostProgress,
  finishPostProgress,
  resetPostProgressForTest,
  startPostProgress,
} from "@/features/posts/lib/post-progress-store";
import type { PostImageResponse } from "@/features/posts/types";

const toastMock = jest.fn();
const routerPushMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      postSuccess: "投稿しました",
      postSuccessViewAction: "見る",
      postSubmitting: "投稿中...",
    })[key] ?? key,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => routerPushMock(...args) }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => toastMock(...args) }),
}));

jest.mock("@/features/credits/hooks/useUsageRewardAmounts", () => ({
  useUsageRewardAmounts: () => ({
    promptUsageRewardAmount: 2,
    styleUsageRewardAmount: 0,
  }),
}));

jest.mock("@/features/posts/components/PostBonusModal", () => ({
  PostBonusModal: ({
    amount,
    isPromptUse,
    multiplier,
    generationType,
    promptUsageRewardAmount,
  }: {
    amount: number;
    isPromptUse: boolean;
    multiplier?: number;
    generationType: string | null;
    promptUsageRewardAmount: number;
  }) => (
    <div data-testid="bonus-modal">
      <span data-testid="bonus-amount">{amount}</span>
      <span data-testid="bonus-prompt-use">{String(isPromptUse)}</span>
      <span data-testid="bonus-multiplier">{multiplier ?? "none"}</span>
      <span data-testid="bonus-generation-type">{generationType ?? "none"}</span>
      <span data-testid="bonus-reward-amount">{promptUsageRewardAmount}</span>
    </div>
  ),
}));

function response(overrides: Partial<PostImageResponse> = {}): PostImageResponse {
  return {
    id: "post-1",
    is_posted: true,
    caption: null,
    posted_at: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as PostImageResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetPostProgressForTest();
});

describe("PostProgressHost", () => {
  test("送信中はバーを出す", () => {
    render(<PostProgressHost />);
    expect(screen.queryByText("投稿中...")).not.toBeInTheDocument();

    act(() => {
      startPostProgress();
    });

    expect(screen.getByText("投稿中...")).toBeInTheDocument();
  });

  test("失敗したらバーを畳む（エラーは投稿モーダルが出す）", () => {
    render(<PostProgressHost />);
    act(() => {
      startPostProgress();
    });

    act(() => {
      abortPostProgress();
    });

    expect(screen.queryByText("投稿中...")).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  /**
   * ⭐ 「付与があればモーダル、無ければトースト」と出し分けると、
   * 付与額の取得に失敗したときに**どちらも出ない**。
   * 投稿できたことすら伝わらなくなるので、トーストは常に出す。
   */
  test("⭐付与が無くてもトーストは出す", async () => {
    render(<PostProgressHost />);

    act(() => {
      finishPostProgress(response({ bonus_granted: 0 }));
    });

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(toastMock.mock.calls[0][0].title).toBe("投稿しました");
    expect(screen.queryByTestId("bonus-modal")).not.toBeInTheDocument();
  });

  test("⭐付与があればトーストと付与モーダルの両方を出す", async () => {
    render(<PostProgressHost />);

    act(() => {
      finishPostProgress(response({ bonus_granted: 20 }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("bonus-modal")).toBeInTheDocument()
    );
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bonus-amount")).toHaveTextContent("20");
  });

  test("投稿ボーナスと上乗せを合算して出す", async () => {
    render(<PostProgressHost />);

    act(() => {
      finishPostProgress(
        response({ bonus_granted: 0, prompt_use_bonus_granted: 20 })
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId("bonus-amount")).toHaveTextContent("20")
    );
    // 上乗せだけでも「プロンプト利用」として扱う
    expect(screen.getByTestId("bonus-prompt-use")).toHaveTextContent("true");
  });

  /**
   * ⭐ 無料プランに「1倍」と出すと、増えているように読める。
   */
  test("⭐倍率バッジは有料プランで倍率が付いたときだけ", async () => {
    const { unmount } = render(<PostProgressHost />);
    act(() => {
      finishPostProgress(
        response({
          bonus_granted: 20,
          subscription_plan: "free",
          bonus_multiplier: 1,
        })
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("bonus-multiplier")).toHaveTextContent("none")
    );
    unmount();

    resetPostProgressForTest();
    render(<PostProgressHost />);
    act(() => {
      finishPostProgress(
        response({
          bonus_granted: 20,
          subscription_plan: "standard",
          bonus_multiplier: 2,
        })
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("bonus-multiplier")).toHaveTextContent("2")
    );
  });

  /**
   * ⭐ 生成方法はモーダルへそのまま渡す。
   *
   * ワンタップのスタイルは運営・クリエイター枠が作ったもので、投稿者に
   * 利用還元は入らない。全生成方法で還元を案内すると嘘になるため、
   * モーダル側が生成方法で出し分けている。ここはその材料を落とさないこと。
   */
  test("⭐生成方法と還元額をモーダルへ渡す（還元の案内の出し分けに要る）", async () => {
    render(<PostProgressHost />);

    act(() => {
      finishPostProgress(
        response({ bonus_granted: 20, generation_type: "free" })
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId("bonus-generation-type")).toHaveTextContent(
        "free"
      )
    );
    expect(screen.getByTestId("bonus-reward-amount")).toHaveTextContent("2");
  });

  test("トーストのボタンから投稿の詳細へ送る", async () => {
    render(<PostProgressHost />);

    act(() => {
      finishPostProgress(response({ id: "abc def" }));
    });

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    const action = toastMock.mock.calls[0][0].action as React.ReactElement<{
      onClick: () => void;
    }>;
    act(() => {
      action.props.onClick();
    });

    // ID はそのまま繋がない（URL に使えない文字が来ても壊れないように）
    expect(routerPushMock).toHaveBeenCalledWith("/posts/abc%20def");
  });

  /**
   * ⭐ 完了は一度だけ知らせる。読み取ったら畳んでおかないと、
   * 再レンダーのたびにトーストが積み上がる。
   */
  test("⭐同じ完了で二度知らせない", async () => {
    const { rerender } = render(<PostProgressHost />);

    act(() => {
      finishPostProgress(response({ bonus_granted: 0 }));
    });
    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));

    rerender(<PostProgressHost />);
    rerender(<PostProgressHost />);

    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});
