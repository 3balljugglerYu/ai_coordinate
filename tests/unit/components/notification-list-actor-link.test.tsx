/**
 * NotificationList のアバタータップ導線のテスト (REQ-008)。
 *
 * actor プロフィールへ遷移できる type の判定は、ハンドラー内のガードと
 * avatarOnClick を付ける判定の2箇所にあり、共通 predicate に統一されている。
 * 片方だけの更新ではタップが効かないため、derived_post_published の
 * タップをコンポーネント境界で固定する。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import type { Notification } from "@/features/notifications/types";

const pushMock = jest.fn();
const markReadMock = jest.fn();
const handleNotificationClickMock = jest.fn();
let mockNotifications: Notification[] = [];

jest.mock("next-intl", () => ({
  useTranslations: () => ((key: string) => key) as never,
  useLocale: () => "ja",
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    onClick,
  }: {
    alt?: string;
    src?: string;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  }) => React.createElement("img", { alt, src, onClick }),
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
    handleNotificationClick: handleNotificationClickMock,
    markAllRead: jest.fn(),
    markRead: markReadMock,
  }),
}));

function createDerivedNotification(
  overrides: Partial<Notification> = {}
): Notification {
  return {
    id: "n-1",
    recipient_id: "origin-author",
    actor_id: "deriver-1",
    type: "derived_post_published",
    entity_type: "post",
    entity_id: "derived-post-1",
    title: "fallback title",
    body: "",
    data: {},
    is_read: false,
    read_at: null,
    created_at: "2026-08-04T00:00:00.000Z",
    actor: {
      id: "deriver-1",
      nickname: "ゆき",
      avatar_url: "https://cdn.example/avatar.png",
    },
    post: null,
    ...overrides,
  } as Notification;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifications = [createDerivedNotification()];
});

describe("派生投稿通知のアバター導線", () => {
  it("アバタータップで派生者のプロフィールへ遷移し未読を既読化する", () => {
    render(<NotificationList />);

    fireEvent.click(screen.getByAltText("ゆき"));

    expect(pushMock).toHaveBeenCalledWith(
      "/users/deriver-1?from=notifications"
    );
    expect(markReadMock).toHaveBeenCalledWith(["n-1"]);
    // stopPropagation により通知本体のクリックは発火しない
    expect(handleNotificationClickMock).not.toHaveBeenCalled();
  });

  it("対象外タイプではアバターにタップ導線が付かない", () => {
    mockNotifications = [
      createDerivedNotification({
        type: "follow",
        entity_type: "user",
        entity_id: "origin-author",
      }),
    ];

    render(<NotificationList />);

    fireEvent.click(screen.getByAltText("ゆき"));

    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("利用数マイルストーン通知の匿名表示", () => {
  it("運営ロゴで表示され、アバターにタップ導線が付かない", () => {
    // actor_id には recipient 本人が入るが、本人のアバターを出すと
    // 「自分が自分に通知した」ように見える (B案 REQ-005)
    mockNotifications = [
      createDerivedNotification({
        id: "n-2",
        type: "derived_usage_milestone",
        entity_id: "origin-post-1",
        actor_id: "origin-author",
        recipient_id: "origin-author",
        data: { milestone: 1 },
        actor: {
          id: "origin-author",
          nickname: "みきふく",
          avatar_url: "https://cdn.example/self.png",
        },
      }),
    ];

    render(<NotificationList />);

    expect(screen.getByAltText("Persta.AI")).toBeInTheDocument();
    expect(screen.queryByAltText("みきふく")).not.toBeInTheDocument();

    fireEvent.click(screen.getByAltText("Persta.AI"));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
