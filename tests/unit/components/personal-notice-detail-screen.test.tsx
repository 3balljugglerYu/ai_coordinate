/**
 * 個人あてのお知らせの詳細(PN-010 / PN-011)。
 * 本文は文字として描き、http(s) の URL だけをリンクにする。開いた記録は1回だけ送る。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PersonalNoticeDetailScreen } from "@/features/notifications/components/PersonalNoticeDetailScreen";
import { markPersonalNoticeOpened } from "@/features/notifications/lib/personal-notice-api";

jest.mock("next-intl", () => ({
  useTranslations: () => ((key: string) => key) as never,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt?: string; src?: string }) =>
    React.createElement("img", { alt, src }),
}));

const refreshUnreadCountMock = jest.fn();
jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: () => ({ refreshUnreadCount: refreshUnreadCountMock }),
}));

jest.mock("@/features/notifications/lib/personal-notice-api", () => ({
  markPersonalNoticeOpened: jest.fn(),
}));

const mockMarkOpened = markPersonalNoticeOpened as jest.MockedFunction<
  typeof markPersonalNoticeOpened
>;

const baseNotice = {
  id: "notice-1",
  title: "🎃当選のお知らせ",
  body: "受付番号: HBS-7F3K\nhttps://forms.gle/abc\njavascript:alert(1)\n<b>太字</b>",
  receivedAtLabel: "2026年11月7日",
  post: null,
  alreadyOpened: false,
};

describe("PersonalNoticeDetailScreen", () => {
  beforeEach(() => {
    refreshUnreadCountMock.mockReset();
    mockMarkOpened.mockReset();
    mockMarkOpened.mockResolvedValue(undefined);
  });

  test("http(s)のURLだけをリンクにし_ほかは文字のまま出す", () => {
    render(<PersonalNoticeDetailScreen notice={baseNotice} />);

    const links = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("target") === "_blank");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://forms.gle/abc");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(/javascript:alert\(1\)/)).toBeTruthy();
    expect(screen.getByText(/<b>太字<\/b>/)).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });

  test("作品つきは画像と「作品を見る」が投稿詳細へリンクする", () => {
    render(
      <PersonalNoticeDetailScreen
        notice={{
          ...baseNotice,
          post: { id: "post-1", imageUrl: "https://cdn.example/a.webp" },
        }}
      />
    );

    expect(
      screen.getByAltText("personalNoticePostImageAlt").getAttribute("src")
    ).toBe("https://cdn.example/a.webp");
    expect(
      screen
        .getByRole("link", { name: "personalNoticeViewPost" })
        .getAttribute("href")
    ).toBe("/posts/post-1?from=notifications");
  });

  test("作品なしは画像も「作品を見る」も出さない", () => {
    render(<PersonalNoticeDetailScreen notice={baseNotice} />);

    expect(screen.queryByAltText("personalNoticePostImageAlt")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "personalNoticeViewPost" })
    ).toBeNull();
  });

  test("開いた記録は描き直しても1回だけ送る", () => {
    const { rerender } = render(
      <PersonalNoticeDetailScreen notice={baseNotice} />
    );
    rerender(<PersonalNoticeDetailScreen notice={{ ...baseNotice }} />);

    expect(mockMarkOpened).toHaveBeenCalledTimes(1);
    expect(mockMarkOpened).toHaveBeenCalledWith("notice-1");
  });

  test("記録できたらヘッダーの未読の数を合わせ直す(直接開いたとき用)", async () => {
    render(<PersonalNoticeDetailScreen notice={baseNotice} />);

    await waitFor(() => expect(refreshUnreadCountMock).toHaveBeenCalledTimes(1));
  });

  test("記録に失敗しても画面は出したまま_未読の数は触らない", async () => {
    mockMarkOpened.mockRejectedValue(new Error("network"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(<PersonalNoticeDetailScreen notice={baseNotice} />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByText("🎃当選のお知らせ")).toBeTruthy();
    expect(refreshUnreadCountMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("同じ画面のまま別のお知らせに変わったら_そちらも記録する", () => {
    const { rerender } = render(
      <PersonalNoticeDetailScreen notice={baseNotice} />
    );
    rerender(
      <PersonalNoticeDetailScreen notice={{ ...baseNotice, id: "notice-2" }} />
    );

    expect(mockMarkOpened.mock.calls).toEqual([["notice-1"], ["notice-2"]]);
  });

  test("前に開いたことがあれば記録を送らない", () => {
    render(
      <PersonalNoticeDetailScreen notice={{ ...baseNotice, alreadyOpened: true }} />
    );

    expect(mockMarkOpened).not.toHaveBeenCalled();
  });

  test("管理画面のプレビュー(recordOpened=false)では記録しない", () => {
    render(
      <PersonalNoticeDetailScreen notice={baseNotice} recordOpened={false} />
    );

    expect(mockMarkOpened).not.toHaveBeenCalled();
  });
});

function linksIn(body: string) {
  render(<PersonalNoticeDetailScreen notice={{ ...baseNotice, body }} recordOpened={false} />);
  return screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("target") === "_blank")
    .map((a) => a.getAttribute("href"));
}

describe("本文のリンク", () => {
  test("URLのすぐ後ろの日本語はリンクに入れない", () => {
    expect(linksIn("こちらhttps://forms.gle/abcからご回答ください")).toEqual([
      "https://forms.gle/abc",
    ]);
  });

  test("文の終わりの句読点と閉じ括弧はリンクに入れない", () => {
    expect(
      linksIn("https://forms.gle/a。\nhttps://forms.gle/b.\n[https://forms.gle/c]\n（https://forms.gle/d）")
    ).toEqual([
      "https://forms.gle/a",
      "https://forms.gle/b",
      "https://forms.gle/c",
      "https://forms.gle/d",
    ]);
  });

  test("URLとして読めないものはリンクにしない", () => {
    render(
      <PersonalNoticeDetailScreen
        notice={{ ...baseNotice, body: "https://." }}
        recordOpened={false}
      />
    );
    expect(
      screen.queryAllByRole("link").filter((a) => a.getAttribute("target") === "_blank")
    ).toHaveLength(0);
  });
});
