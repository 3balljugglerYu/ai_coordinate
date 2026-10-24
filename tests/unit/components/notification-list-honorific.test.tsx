/**
 * お知らせ一覧の相手の名前に「さん」を付ける(2026-10-24 ユーザー決定)。
 * 日本語の文だけ。アバターの代わりの文字(alt)は名前のまま。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import type { Notification } from "@/features/notifications/types";

let mockLocale = "ja";
let mockNotifications: Notification[] = [];

jest.mock("next-intl", () => ({
  // 「キー:相手の名前」の形にして、文に渡った名前を見えるようにする
  useTranslations: () =>
    ((key: string, values?: Record<string, string>) =>
      values?.actor !== undefined ? `${key}:${values.actor}` : key) as never,
  useLocale: () => mockLocale,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt?: string; src?: string }) =>
    React.createElement("img", { alt, src }),
}));

jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: jest.fn(), inView: false }),
}));

jest.mock("@/features/notifications/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: jest.fn(),
    handleNotificationClick: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
  }),
}));

function likeFrom(nickname: string | null): Notification {
  return {
    id: "n-1",
    recipient_id: "me",
    actor_id: "actor-1",
    type: "like",
    entity_type: "post",
    entity_id: "post-1",
    title: "記録の題名",
    body: "",
    data: {},
    is_read: true,
    read_at: null,
    created_at: "2026-10-24T00:00:00.000Z",
    actor: {
      id: "actor-1",
      nickname,
      avatar_url: "https://cdn.example/avatar.png",
    },
    post: null,
  } as Notification;
}

beforeEach(() => {
  mockLocale = "ja";
});

describe("お知らせ一覧の名前の「さん」", () => {
  it("日本語では相手の名前に「さん」を付ける。アバターの alt は名前のまま", () => {
    mockNotifications = [likeFrom("りる🐣")];
    render(<NotificationList autoMarkAllRead={false} />);

    expect(screen.getByText("likeTitle:りる🐣さん")).not.toBeNull();
    expect(screen.getByAltText("りる🐣")).not.toBeNull();
  });

  it("もう敬称の付いた名前には重ねない", () => {
    mockNotifications = [likeFrom("みきちゃん")];
    render(<NotificationList autoMarkAllRead={false} />);

    expect(screen.getByText("likeTitle:みきちゃん")).not.toBeNull();
  });

  it("名前が無ければ「ユーザー」の代わりの文字に付ける", () => {
    mockNotifications = [likeFrom(null)];
    render(<NotificationList autoMarkAllRead={false} />);

    expect(screen.getByText("likeTitle:userFallbackさん")).not.toBeNull();
  });

  it("空白だけのニックネームは「ユーザー」の代わりの文字にする", () => {
    mockNotifications = [likeFrom("   ")];
    render(<NotificationList autoMarkAllRead={false} />);

    expect(screen.getByText("likeTitle:userFallbackさん")).not.toBeNull();
  });

  it("日本語以外では付けない", () => {
    mockLocale = "en";
    mockNotifications = [likeFrom("Miki")];
    render(<NotificationList autoMarkAllRead={false} />);

    expect(screen.getByText("likeTitle:Miki")).not.toBeNull();
  });
});
