import { act, renderHook, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/features/notifications/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import type { Notification } from "@/features/notifications/types";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/features/notifications/lib/api", () => ({
  getNotifications: jest.fn(),
  getUnreadCount: jest.fn(),
  markNotificationsRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: jest.fn(),
}));

jest.mock(
  "@/features/notifications/components/UnreadNotificationProvider",
  () => ({
    useUnreadNotificationCount: jest.fn(),
  })
);

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const getCurrentUserMock = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const getNotificationsMock = getNotifications as jest.MockedFunction<
  typeof getNotifications
>;
const getUnreadCountMock = getUnreadCount as jest.MockedFunction<
  typeof getUnreadCount
>;
const markNotificationsReadMock = markNotificationsRead as jest.MockedFunction<
  typeof markNotificationsRead
>;
const markAllNotificationsReadMock =
  markAllNotificationsRead as jest.MockedFunction<typeof markAllNotificationsRead>;
const createClientMock = createClient as jest.MockedFunction<typeof createClient>;
const useToastMock = useToast as jest.MockedFunction<typeof useToast>;
const useUnreadNotificationCountMock =
  useUnreadNotificationCount as jest.MockedFunction<typeof useUnreadNotificationCount>;

function createNotification(
  overrides: Partial<Notification> = {}
): Notification {
  return {
    id: "notification-1",
    recipient_id: "recipient-1",
    actor_id: "actor-1",
    type: "comment",
    entity_type: "comment",
    entity_id: "parent-comment-1",
    title: "fallback title",
    body: "fallback body",
    data: {
      image_id: "post-123",
      comment_id: "reply-1",
      comment_content: "reply body",
    },
    is_read: true,
    read_at: "2026-04-16T00:00:00.000Z",
    created_at: "2026-04-16T00:00:00.000Z",
    actor: null,
    post: null,
    ...overrides,
  };
}

async function flushAsyncEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderNotificationsHook(
  initialData?: Parameters<typeof useNotifications>[0]
) {
  const hook = renderHook(() => useNotifications(initialData));
  await flushAsyncEffects();
  return hook;
}

describe("useNotifications", () => {
  const pushMock = jest.fn();
  const toastMock = jest.fn();
  const refreshUnreadCountMock = jest.fn().mockResolvedValue(undefined);
  let channelFactoryMock: jest.Mock;
  let removeChannelMock: jest.Mock;
  let realtimeInsertHandler:
    | ((payload: { new: Notification }) => void)
    | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeInsertHandler = null;
    const translateNotifications = (
      key: string,
      values?: Record<string, unknown>
    ) => {
      if (key === "userFallback") return "User";
      if (key === "fetchFailed") return "fetch failed";
      if (key === "fetchUnreadFailed") return "fetch unread failed";
      if (key === "markReadFailed") return "mark read failed";
      if (key === "markAllReadFailed") return "mark all read failed";
      if (key === "replyTitle") return `${values?.actor} replied to your comment`;
      if (key === "commentTitle")
        return `${values?.actor} commented on your post`;
      if (key === "bonusAdminTitle") return "Admin bonus";
      if (key === "bonusAdminBody") return `${values?.amount} bonus points`;
      return key;
    };

    useTranslationsMock.mockImplementation((namespace?: string) => {
      if (namespace !== "notifications") {
        throw new Error(`Unexpected namespace: ${namespace}`);
      }

      return translateNotifications as ReturnType<typeof useTranslations>;
    });

    usePathnameMock.mockReturnValue("/notifications");
    useRouterMock.mockReturnValue({
      push: pushMock,
    } as unknown as ReturnType<typeof useRouter>);
    getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
    getNotificationsMock.mockResolvedValue({
      notifications: [],
      nextCursor: null,
    });
    getUnreadCountMock.mockResolvedValue(0);
    markNotificationsReadMock.mockResolvedValue({ success: true });
    markAllNotificationsReadMock.mockResolvedValue({ success: true });
    channelFactoryMock = jest.fn();
    removeChannelMock = jest.fn();
    createClientMock.mockImplementation(() => {
      const channel = {} as {
        on: jest.Mock;
        subscribe: jest.Mock;
      };

      channel.on = jest.fn().mockImplementation((_event, filter, callback) => {
        if (
          typeof filter === "object" &&
          filter !== null &&
          "event" in filter &&
          filter.event === "INSERT"
        ) {
          realtimeInsertHandler = callback as (payload: { new: Notification }) => void;
        }

        return channel;
      });
      channel.subscribe = jest.fn().mockReturnValue(channel);
      channelFactoryMock.mockReturnValue(channel);

      return {
        channel: channelFactoryMock,
        removeChannel: removeChannelMock,
      } as never;
    });
    useToastMock.mockReturnValue({
      toast: toastMock,
    });
    useUnreadNotificationCountMock.mockReturnValue({
      unreadCount: 0,
      refreshUnreadCount: refreshUnreadCountMock,
    } as never);
  });

  test("initialDataがある場合_初回通知取得をスキップする", async () => {
    await renderNotificationsHook({
      notifications: [createNotification()],
      nextCursor: null,
    });

    expect(getCurrentUserMock).toHaveBeenCalled();
    expect(getUnreadCountMock).toHaveBeenCalled();
    expect(getNotificationsMock).not.toHaveBeenCalled();
  });

  test("認証済みユーザーで初期化した場合_通知取得とRealtime購読を開始する", async () => {
    usePathnameMock.mockReturnValue("/feed");
    getNotificationsMock.mockResolvedValue({
      notifications: [
        createNotification({
          id: "notification-2",
          is_read: false,
          read_at: null,
        }),
      ],
      nextCursor: "cursor-2",
    });
    getUnreadCountMock.mockResolvedValue(3);

    const { result } = await renderNotificationsHook();

    await waitFor(() => {
      expect(getNotificationsMock).toHaveBeenCalledWith(20, null, {
        fetchFailed: "fetch failed",
      });
      expect(getUnreadCountMock).toHaveBeenCalledWith({
        unreadCountFailed: "fetch unread failed",
      });
      expect(channelFactoryMock).toHaveBeenCalledWith("notifications:user-1");
      expect(result.current.notifications).toEqual([
        expect.objectContaining({ id: "notification-2" }),
      ]);
      expect(result.current.unreadCount).toBe(3);
      expect(result.current.hasMore).toBe(true);
    });
  });

  test("comment通知クリック時_image_idを使って投稿詳細へ遷移する", async () => {
    const { result } = await renderNotificationsHook();

    act(() => {
      result.current.handleNotificationClick(
        createNotification({
          is_read: false,
          read_at: null,
          entity_type: "comment",
          data: {
            image_id: "post-123",
            comment_id: "reply-1",
          },
        })
      );
    });

    await waitFor(() => {
      expect(markNotificationsReadMock).toHaveBeenCalledWith(
        ["notification-1"],
        { markReadFailed: "mark read failed" }
      );
    });

    expect(pushMock).toHaveBeenCalledWith("/posts/post-123?from=notifications");
  });

  test("既読のcomment通知クリック時_既読化せず投稿詳細へ遷移する", async () => {
    const { result } = await renderNotificationsHook();

    act(() => {
      result.current.handleNotificationClick(createNotification());
    });

    expect(markNotificationsReadMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/posts/post-123?from=notifications");
  });

  test("comment通知にimage_idがない場合_comment分岐では遷移しない", async () => {
    const { result } = await renderNotificationsHook();

    act(() => {
      result.current.handleNotificationClick(
        createNotification({
          entity_type: "comment",
          data: {
            comment_id: "reply-1",
          },
        })
      );
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  test.each([
    [
      "post通知",
      createNotification({
        entity_type: "post",
        entity_id: "post-999",
      }),
      "/posts/post-999?from=notifications",
    ],
    [
      "user通知",
      createNotification({
        entity_type: "user",
        entity_id: "user-999",
      }),
      "/users/user-999?from=notifications",
    ],
    [
      "follow通知",
      createNotification({
        type: "follow",
        entity_type: "user",
        entity_id: "ignored-user",
        data: {
          follower_id: "follower-1",
        },
      }),
      "/users/follower-1?from=notifications",
    ],
    [
      "bonus通知",
      createNotification({
        type: "bonus",
        entity_type: "user",
        entity_id: "ignored-user",
        data: {
          bonus_type: "admin_bonus",
          bonus_amount: 20,
        },
      }),
      "/my-page",
    ],
  ])("%sクリック時_対応する遷移先へ移動する", async (_label, notification, destination) => {
    const { result } = await renderNotificationsHook();

    act(() => {
      result.current.handleNotificationClick(notification);
    });

    expect(pushMock).toHaveBeenCalledWith(destination);
  });

  test("markRead失敗時_通知一覧と未読件数を再取得する", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    markNotificationsReadMock.mockRejectedValue(new Error("mark read failed"));
    const notification = createNotification({
      is_read: false,
      read_at: null,
    });
    const { result } = await renderNotificationsHook({
      notifications: [notification],
      nextCursor: null,
    });

    act(() => {
      result.current.handleNotificationClick(notification);
    });

    await flushAsyncEffects();

    await waitFor(() => {
      expect(getNotificationsMock).toHaveBeenCalledTimes(1);
      expect(getUnreadCountMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    consoleErrorSpy.mockRestore();
  });

  test("通知画面外で未読ボーナス通知がRealtime到着した場合_toastを一度だけ表示する", async () => {
    usePathnameMock.mockReturnValue("/feed");

    await renderNotificationsHook();

    await waitFor(() => {
      expect(realtimeInsertHandler).not.toBeNull();
    });

    act(() => {
      realtimeInsertHandler?.({
        new: createNotification({
          id: "bonus-1",
          type: "bonus",
          entity_type: "user",
          entity_id: "ignored-user",
          title: "",
          is_read: false,
          read_at: null,
          data: {
            bonus_type: "admin_bonus",
            bonus_amount: 15,
          },
        }),
      });
    });

    await flushAsyncEffects();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Admin bonus",
        description: "15 bonus points",
      })
    );
    expect(refreshUnreadCountMock).toHaveBeenCalled();
  });
});
