/**
 * FollowButton の状態取得のテスト。
 *
 * ここが誤ると、一覧のようにボタンが何十個も並ぶ画面で
 * `/api/users/{id}/follow-status` が大量に飛び、ブラウザの同時接続上限を
 * 食い潰して無限スクロールなど他の通信が止まる（実機で発生した）。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { FollowButton } from "@/features/users/components/FollowButton";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

const AUTHOR_ID = "author-1";
const VIEWER_ID = "viewer-1";

function mockFetch(isFollowing = false) {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ isFollowing }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("FollowButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("既知のフォロー状態を渡されたら問い合わせない", async () => {
    const fetchMock = mockFetch();

    render(
      <FollowButton
        userId={AUTHOR_ID}
        currentUserId={VIEWER_ID}
        initialIsFollowing={false}
      />
    );

    expect(await screen.findByText("follow")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("既知の状態が true ならフォロー解除の表示になる", async () => {
    mockFetch();

    render(
      <FollowButton userId={AUTHOR_ID} currentUserId={VIEWER_ID} initialIsFollowing />
    );

    expect(await screen.findByText("unfollow")).toBeInTheDocument();
  });

  test("既知の状態が無ければ従来どおり自分で取得する", async () => {
    const fetchMock = mockFetch(true);

    render(<FollowButton userId={AUTHOR_ID} currentUserId={VIEWER_ID} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/users/${AUTHOR_ID}/follow-status`);
    });
    expect(await screen.findByText("unfollow")).toBeInTheDocument();
  });

  test("onFollowChange がレンダーごとに変わっても取得を繰り返さない", async () => {
    // インライン関数を渡す呼び出し側でも、取得→再レンダー→再取得の
    // 無限ループにならないこと
    const fetchMock = mockFetch();

    const { rerender } = render(
      <FollowButton
        userId={AUTHOR_ID}
        currentUserId={VIEWER_ID}
        onFollowChange={() => {}}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 毎回新しい関数を渡し直す（インライン関数と同じ状況）
    for (let i = 0; i < 5; i += 1) {
      rerender(
        <FollowButton
          userId={AUTHOR_ID}
          currentUserId={VIEWER_ID}
          onFollowChange={() => {}}
        />
      );
    }

    await waitFor(() => expect(screen.getByText("follow")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("既知の状態が後から変わったら追従する", async () => {
    mockFetch();

    const { rerender } = render(
      <FollowButton
        userId={AUTHOR_ID}
        currentUserId={VIEWER_ID}
        initialIsFollowing={false}
      />
    );
    expect(await screen.findByText("follow")).toBeInTheDocument();

    rerender(
      <FollowButton userId={AUTHOR_ID} currentUserId={VIEWER_ID} initialIsFollowing />
    );
    expect(await screen.findByText("unfollow")).toBeInTheDocument();
  });

  test("自分自身には表示しない", () => {
    mockFetch();

    const { container } = render(
      <FollowButton userId={AUTHOR_ID} currentUserId={AUTHOR_ID} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
