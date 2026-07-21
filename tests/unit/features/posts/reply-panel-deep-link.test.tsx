/** @jest-environment jsdom */

import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { ReplyPanel } from "@/features/posts/components/ReplyPanel";
import type { ParentComment, ReplyComment } from "@/features/posts/types";

const getRepliesAPIMock = jest.fn();
const scrollIntoViewMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: () => null,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Title: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Close: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/features/posts/lib/api", () => ({
  getRepliesAPI: (...args: unknown[]) => getRepliesAPIMock(...args),
}));

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: jest.fn(() => channel),
      subscribe: jest.fn(() => channel),
    };
    return { channel: () => channel, removeChannel: jest.fn() };
  },
}));

jest.mock("@/features/posts/components/EditableComment", () => ({
  EditableComment: () => <div data-testid="parent-comment" />,
}));

jest.mock("@/features/posts/components/ReplyPanelSkeleton", () => ({
  ReplyPanelSkeleton: () => null,
}));

jest.mock("@/features/posts/components/CommentComposerTrigger", () => ({
  CommentComposerTrigger: () => null,
}));

jest.mock("@/features/posts/components/CommentComposerSheet", () => ({
  CommentComposerSheet: () => null,
}));

jest.mock("@/features/posts/components/ReplyItem", () => ({
  ReplyItem: ({
    reply,
    highlighted,
  }: {
    reply: ReplyComment;
    highlighted?: boolean;
  }) => (
    <div data-reply-id={reply.id} data-highlighted={String(Boolean(highlighted))}>
      {reply.content}
    </div>
  ),
}));

function reply(id: string): ReplyComment {
  return {
    id,
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: "comment-1",
    reply_to_comment_id: null,
    reply_to_deleted: false,
    reply_to: null,
    content: `reply ${id}`,
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    user_nickname: "taro",
    user_avatar_url: null,
  };
}

function parentComment(replyCount: number): ParentComment {
  return {
    id: "comment-1",
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: null,
    content: "parent",
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    last_activity_at: "2026-04-16T00:00:00.000Z",
    reply_count: replyCount,
    user_nickname: "taro",
    user_avatar_url: null,
  };
}

function renderPanel(replyCount: number, onConsumed: jest.Mock) {
  return render(
    <ReplyPanel
      open
      onOpenChange={jest.fn()}
      parentComment={parentComment(replyCount)}
      currentUserId="user-1"
      onThreadChanged={jest.fn()}
      panelStyle={{}}
      deepLinkReplyId="target-reply"
      onDeepLinkReplyConsumed={onConsumed}
    />
  );
}

describe("ReplyPanel 通知ディープリンク", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  test("deepLinkReplyId指定時_対象へスクロールしハイライトする", async () => {
    getRepliesAPIMock.mockResolvedValue([reply("r1"), reply("target-reply")]);
    const onConsumed = jest.fn();

    renderPanel(2, onConsumed);

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-reply-id="target-reply"]')
          ?.getAttribute("data-highlighted")
      ).toBe("true")
    );
  });

  test("対象が1ページ目に無い場合_追加読み込みして探す", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => reply(`p1-${i}`));
    getRepliesAPIMock.mockImplementation(
      (_id: string, _limit: number, offset: number) =>
        Promise.resolve(offset >= 20 ? [reply("target-reply")] : page1)
    );
    const onConsumed = jest.fn();

    renderPanel(21, onConsumed);

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    expect(
      getRepliesAPIMock.mock.calls.some((call) => call[2] === 20)
    ).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  test("ページ跨ぎ探索後_件数同期リセットで対象が消えない(回帰)", async () => {
    // 返信数60件・対象は2ページ目。全件読み切っていない(40/60)状態でも、
    // useReplies の件数同期が offset 0 のリセットを再発火して探索済み
    // ページ(対象を含む)を置き換えないことを確認する。
    const page1 = Array.from({ length: 20 }, (_, i) => reply(`p1-${i}`));
    const page2 = [
      ...Array.from({ length: 19 }, (_, i) => reply(`p2-${i}`)),
      reply("target-reply"),
    ];
    getRepliesAPIMock.mockImplementation(
      (_id: string, _limit: number, offset: number) =>
        Promise.resolve(offset >= 20 ? page2 : page1)
    );
    const onConsumed = jest.fn();

    renderPanel(60, onConsumed);

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    // 後続の非同期処理(件数同期等)が走り切るのを待ってから最終状態を確認
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // 対象が消えずに表示され続けている
    expect(
      document.querySelector('[data-reply-id="target-reply"]')
    ).not.toBeNull();
    // offset 0 のリセット取得は初回の1回のみ(追加読み込み後に再発火しない)
    expect(
      getRepliesAPIMock.mock.calls.filter((call) => call[2] === 0)
    ).toHaveLength(1);
  });

  test("対象が見つからない場合_断念して通常表示する", async () => {
    getRepliesAPIMock.mockResolvedValue([reply("r1")]);
    const onConsumed = jest.fn();

    renderPanel(1, onConsumed);

    await waitFor(() => expect(onConsumed).toHaveBeenCalled());
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
