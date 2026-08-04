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

    if (key === "replyToReplyTitle") {
      return `${values?.actor} replied to your reply`;
    }

    if (key === "likeTitle") {
      return `${values?.actor} liked your post`;
    }

    if (key === "followTitle") {
      return `${values?.actor} followed you`;
    }

    if (key === "derivedPostTitle") {
      return `${values?.actor} posted a work using your prompt "${values?.origin}"`;
    }

    if (key === "derivedPostTitleNoCaption") {
      return `${values?.actor} posted a work using your prompt`;
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

  test("comment通知でreply_kindがreply_to_replyの場合_replyToReplyTitleを返す", () => {
    const result = formatNotificationContent(
      createNotification({
        entity_type: "comment",
        data: {
          comment_content: "hello from quote reply",
          reply_kind: "reply_to_reply",
        },
      }),
      "Carol",
      translate
    );

    expect(result).toEqual({
      title: "Carol replied to your reply",
      body: "hello from quote reply",
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

  test("派生投稿通知_原作キャプション付きの見出しを組む", () => {
    const result = formatNotificationContent(
      createNotification({
        type: "derived_post_published",
        entity_type: "post",
        entity_id: "derived-post-1",
        data: { origin_caption: "桜ドレスコーデ" },
      }),
      "ゆき",
      translate
    );

    expect(result).toEqual({
      title: 'ゆき posted a work using your prompt "桜ドレスコーデ"',
      body: "",
    });
  });

  test("派生投稿通知_キャプションが無い場合はNoCaption版の見出しを使う", () => {
    for (const data of [{}, { origin_caption: "   " }]) {
      const result = formatNotificationContent(
        createNotification({
          type: "derived_post_published",
          entity_type: "post",
          entity_id: "derived-post-1",
          data,
        }),
        "ゆき",
        translate
      );

      expect(result).toEqual({
        title: "ゆき posted a work using your prompt",
        body: "",
      });
    }
  });

  test("派生投稿通知_書記素20文字ちょうどのキャプションは省略記号を付けない", () => {
    const caption = "あ".repeat(20);
    const result = formatNotificationContent(
      createNotification({
        type: "derived_post_published",
        entity_type: "post",
        data: { origin_caption: caption },
      }),
      "ゆき",
      translate
    );

    expect(result.title).toBe(
      `ゆき posted a work using your prompt "${caption}"`
    );
  });

  test("派生投稿通知_20文字を超えたら書記素単位で切り省略記号を付ける", () => {
    const result = formatNotificationContent(
      createNotification({
        type: "derived_post_published",
        entity_type: "post",
        data: { origin_caption: "あ".repeat(25) },
      }),
      "ゆき",
      translate
    );

    expect(result.title).toBe(
      `ゆき posted a work using your prompt "${"あ".repeat(20)}…"`
    );
  });

  test("派生投稿通知_結合絵文字を書記素の途中で分割しない", () => {
    // 👨‍👩‍👧‍👦 は ZWJ 結合で1書記素（UTF-16 では複数コード単位）。
    // 19文字 + 絵文字 = 20書記素で切れ、絵文字が壊れないこと。
    const caption = "あ".repeat(19) + "👨‍👩‍👧‍👦" + "つづき";
    const result = formatNotificationContent(
      createNotification({
        type: "derived_post_published",
        entity_type: "post",
        data: { origin_caption: caption },
      }),
      "ゆき",
      translate
    );

    expect(result.title).toBe(
      `ゆき posted a work using your prompt "${"あ".repeat(19)}👨‍👩‍👧‍👦…"`
    );
  });
});
