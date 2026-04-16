import {
  formatNotificationContent,
  type NotificationTranslationKey,
} from "@/features/notifications/lib/presentation";
import type { Notification } from "@/features/notifications/types";

function createNotification(
  overrides: Partial<Notification> = {}
): Notification {
  return {
    id: "notification-1",
    recipient_id: "recipient-1",
    actor_id: "actor-1",
    type: "comment",
    entity_type: "post",
    entity_id: "post-1",
    title: "fallback title",
    body: "fallback body",
    data: {
      comment_content: "hello from comment",
    },
    is_read: false,
    read_at: null,
    created_at: "2026-04-16T00:00:00.000Z",
    actor: null,
    post: null,
    ...overrides,
  };
}

describe("formatNotificationContent", () => {
  const translate = (
    key: NotificationTranslationKey,
    values?: Record<string, string | number>
  ) => {
    if (key === "commentTitle") {
      return `${values?.actor} commented on your post`;
    }

    if (key === "replyTitle") {
      return `${values?.actor} replied to your comment`;
    }

    if (key === "likeTitle") {
      return `${values?.actor} liked your post`;
    }

    if (key === "followTitle") {
      return `${values?.actor} followed you`;
    }

    return key;
  };

  test("comment通知がpost実体の場合_commentTitleを返す", () => {
    const result = formatNotificationContent(
      createNotification({
        entity_type: "post",
      }),
      "Alice",
      translate
    );

    expect(result).toEqual({
      title: "Alice commented on your post",
      body: "hello from comment",
    });
  });

  test("comment通知がcomment実体の場合_replyTitleを返す", () => {
    const result = formatNotificationContent(
      createNotification({
        entity_type: "comment",
      }),
      "Bob",
      translate
    );

    expect(result).toEqual({
      title: "Bob replied to your comment",
      body: "hello from comment",
    });
  });

  test("post実体でcomment_contentが無い場合_bodyへフォールバックする", () => {
    const result = formatNotificationContent(
      createNotification({
        entity_type: "post",
        data: {},
        body: "fallback body from post notification",
      }),
      "Alice",
      translate
    );

    expect(result).toEqual({
      title: "Alice commented on your post",
      body: "fallback body from post notification",
    });
  });

  test("comment実体でcomment_contentが空文字の場合_bodyへフォールバックする", () => {
    const result = formatNotificationContent(
      createNotification({
        entity_type: "comment",
        data: {
          comment_content: "   ",
        },
        body: "fallback body from reply notification",
      }),
      "Bob",
      translate
    );

    expect(result).toEqual({
      title: "Bob replied to your comment",
      body: "fallback body from reply notification",
    });
  });
});
