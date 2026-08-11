/**
 * カード上の「このプロンプトで作る」/「フォローして使う」のテスト（ADR-007）。
 *
 * ここが誤ると (a) フォローに失敗したのにシートが開いて生成APIで弾かれる、
 * (b) 未ログインで何も起きない、(c) 使えない原作へ生成を促す、が起きる。
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FollowAndUsePromptButton } from "@/features/posts/components/FollowAndUsePromptButton";
import {
  trackFollowFromCard,
  trackPromptUseTapped,
} from "@/features/posts/lib/home-view-events";
import type { PromptActionSummary } from "@/features/posts/types";

const toastMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const Sheet = (props: { sourcePostId: string; subscriptionPlan: string }) => (
      <div
        data-testid="generation-sheet"
        data-source={props.sourcePostId}
        data-plan={props.subscriptionPlan}
      />
    );
    return Sheet;
  },
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="auth-modal" /> : null,
}));

// 計測は best-effort の副作用。ここでは呼ばれたことだけを見る
jest.mock("@/features/posts/lib/home-view-events", () => ({
  trackPromptUseTapped: jest.fn(),
  trackFollowFromCard: jest.fn(),
}));

const AUTHOR_ID = "author-1";

function buildSummary(overrides: Partial<PromptActionSummary> = {}): PromptActionSummary {
  return {
    originPostId: "origin-1",
    isAvailable: true,
    originAuthorId: AUTHOR_ID,
    originAuthorNickname: "みきふく",
    originAuthorAvatarUrl: null,
    originThumbnailUrl: null,
    originCaption: null,
    usageCount: 0,
    promptVisibility: "private",
    ...overrides,
  };
}

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    const handler = Object.entries(handlers).find(([path]) => url.includes(path))?.[1];
    if (!handler) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return handler();
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("FollowAndUsePromptButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("原作が使えないときは導線ごと出さない", () => {
    const { container } = render(
      <FollowAndUsePromptButton
        summary={buildSummary({ isAvailable: false })}
        currentUserId="viewer-1"
        isFollowingAuthor={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("原作者が分からないときも出さない", () => {
    const { container } = render(
      <FollowAndUsePromptButton
        summary={buildSummary({ originAuthorId: null })}
        currentUserId="viewer-1"
        isFollowingAuthor={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe("フォロー状態が未取得のあいだ", () => {
    test("押せない(既フォローの人が follow API の 400 で詰まるのを防ぐ)", async () => {
      const fetchMock = mockFetch({});
      render(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId="viewer-1"
          isFollowingAuthor={undefined}
        />
      );

      const button = screen.getByTestId("feed-use-prompt-button");
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("取得できたら押せるようになる", async () => {
      mockFetch({
        "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
      });
      const { rerender } = render(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId="viewer-1"
          isFollowingAuthor={undefined}
        />
      );
      expect(screen.getByTestId("feed-use-prompt-button")).toBeDisabled();

      rerender(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId="viewer-1"
          isFollowingAuthor
        />
      );
      expect(screen.getByTestId("feed-use-prompt-button")).not.toBeDisabled();
    });

    test("本人の投稿はフォロー不要なので押せる", () => {
      mockFetch({
        "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
      });
      render(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId={AUTHOR_ID}
          isFollowingAuthor={undefined}
        />
      );
      expect(screen.getByTestId("feed-use-prompt-button")).not.toBeDisabled();
    });
  });

  test("未ログインは AuthModal を開き_フォローも生成もしない", () => {
    const fetchMock = mockFetch({});
    render(
      <FollowAndUsePromptButton
        summary={buildSummary()}
        currentUserId={null}
        isFollowingAuthor={undefined}
      />
    );

    fireEvent.click(screen.getByTestId("feed-use-prompt-button"));

    expect(screen.getByTestId("auth-modal")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("generation-sheet")).not.toBeInTheDocument();
  });

  test("フォロー済みは「このプロンプトで作る」_押すとフォローせずシートが開く", async () => {
    const fetchMock = mockFetch({
      "/api/users/me/subscription-plan": () => jsonResponse({ plan: "standard" }),
    });
    render(
      <FollowAndUsePromptButton
        summary={buildSummary()}
        currentUserId="viewer-1"
        isFollowingAuthor
      />
    );

    expect(screen.getByText("posts.feedUsePrompt")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
    });

    const sheet = await screen.findByTestId("generation-sheet");
    expect(sheet).toHaveAttribute("data-source", "origin-1");
    expect(sheet).toHaveAttribute("data-plan", "standard");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("subscription-plan");
  });

  test("未フォローは「フォローして使う」_成功したらフォロー成立を親へ伝えてシートを開く", async () => {
    mockFetch({
      "/follow": () => jsonResponse({ ok: true }),
      "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
    });
    const onFollowChange = jest.fn();
    render(
      <FollowAndUsePromptButton
        summary={buildSummary()}
        currentUserId="viewer-1"
        isFollowingAuthor={false}
        onFollowChange={onFollowChange}
      />
    );

    expect(screen.getByText("posts.feedFollowAndUsePrompt")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
    });

    await waitFor(() => {
      expect(onFollowChange).toHaveBeenCalledWith(AUTHOR_ID, true);
    });
    expect(await screen.findByTestId("generation-sheet")).toBeInTheDocument();
  });

  test("フォローに失敗したらシートを開かずエラーを出す", async () => {
    mockFetch({
      "/follow": () => jsonResponse({ error: "ブロックされています" }, 403),
    });
    const onFollowChange = jest.fn();
    render(
      <FollowAndUsePromptButton
        summary={buildSummary()}
        currentUserId="viewer-1"
        isFollowingAuthor={false}
        onFollowChange={onFollowChange}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("generation-sheet")).not.toBeInTheDocument();
    expect(onFollowChange).not.toHaveBeenCalled();
  });

  test("本人の投稿はフォロー不要でそのまま開ける", async () => {
    const fetchMock = mockFetch({
      "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
    });
    render(
      <FollowAndUsePromptButton
        summary={buildSummary()}
        currentUserId={AUTHOR_ID}
        isFollowingAuthor={false}
      />
    );

    expect(screen.getByText("posts.feedUsePrompt")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
    });

    expect(await screen.findByTestId("generation-sheet")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/follow"))
    ).toBe(false);
  });

  test("プラン取得に失敗しても無料プランで開く(生成そのものは止めない)", async () => {
    mockFetch({
      "/api/users/me/subscription-plan": () => jsonResponse({}, 500),
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(
      <FollowAndUsePromptButton
        summary={buildSummary()}
        currentUserId="viewer-1"
        isFollowingAuthor
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
    });

    expect(await screen.findByTestId("generation-sheet")).toHaveAttribute(
      "data-plan",
      "free"
    );
    errorSpy.mockRestore();
  });

  describe("計測(ADR-006)", () => {
    test("シートを開いたら prompt_use_tapped を原作IDで記録する", async () => {
      mockFetch({
        "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
      });
      render(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId="viewer-1"
          isFollowingAuthor
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
      });

      expect(trackPromptUseTapped).toHaveBeenCalledWith("origin-1");
      expect(trackFollowFromCard).not.toHaveBeenCalled();
    });

    test("カード経由のフォロー成立も記録する", async () => {
      mockFetch({
        "/follow": () => jsonResponse({ ok: true }),
        "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
      });
      render(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
      });

      await waitFor(() => {
        expect(trackFollowFromCard).toHaveBeenCalledWith("origin-1");
      });
      expect(trackPromptUseTapped).toHaveBeenCalledWith("origin-1");
    });

    test("フォローに失敗したら何も記録しない", async () => {
      mockFetch({ "/follow": () => jsonResponse({ error: "ng" }, 403) });
      render(
        <FollowAndUsePromptButton
          summary={buildSummary()}
          currentUserId="viewer-1"
          isFollowingAuthor={false}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId("feed-use-prompt-button"));
      });

      await waitFor(() => expect(toastMock).toHaveBeenCalled());
      expect(trackPromptUseTapped).not.toHaveBeenCalled();
      expect(trackFollowFromCard).not.toHaveBeenCalled();
    });
  });

  test("利用回数はボタンに出さない(引用カード側に集約している)", () => {
    render(
      <FollowAndUsePromptButton
        summary={buildSummary({ usageCount: 42 })}
        currentUserId="viewer-1"
        isFollowingAuthor
      />
    );
    expect(screen.queryByText("posts.sourcePromptUsageCount")).not.toBeInTheDocument();
  });
});
