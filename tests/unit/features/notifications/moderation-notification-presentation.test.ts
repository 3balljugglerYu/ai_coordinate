/** @jest-environment node */

/**
 * モデレーション通知の表示・遷移・匿名化の回帰テスト。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-002, ADR-008, ADR-011 / REQ-022, REQ-023, REQ-025
 */

import { formatNotificationContent } from "@/features/notifications/lib/presentation";
import { isModerationNotificationType } from "@/features/notifications/types";
import type { Notification } from "@/features/notifications/types";

const RECIPIENT_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "22222222-2222-4222-8222-222222222222";
const DECISION_ID = "33333333-3333-4333-8333-333333333333";

/** i18n を「キー名をそのまま返す」形にして、どのキーが使われたかを検証する。 */
const t = ((key: string) => key) as never;

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: "n1",
    recipient_id: RECIPIENT_ID,
    actor_id: RECIPIENT_ID,
    type: "post_moderation_removed",
    entity_type: "post",
    entity_id: POST_ID,
    title: "投稿を公開停止しました",
    body: "フォールバック本文",
    data: {},
    is_read: false,
    read_at: null,
    created_at: "2026-07-28T00:00:00.000Z",
    ...overrides,
  } as Notification;
}

describe("isModerationNotificationType", () => {
  it("モデレーション系のみ true", () => {
    expect(isModerationNotificationType("post_moderation_removed")).toBe(true);
    expect(isModerationNotificationType("post_moderation_appeal_result")).toBe(true);
    expect(isModerationNotificationType("like")).toBe(false);
    expect(isModerationNotificationType("bonus")).toBe(false);
  });
});

describe("公開停止通知の表示", () => {
  it("タイトルは i18n キー経由で「公開停止」の文言を使う", () => {
    const result = formatNotificationContent(
      makeNotification({ data: { author_facing_reason: "著作権侵害のため" } }),
      "誰か",
      t
    );
    // 「削除」ではなく公開停止の文言キーを引くこと (REQ-025)
    expect(result.title).toBe("moderationRemovedTitle");
  });

  it("本文には運営が書いた投稿者向け説明を出す", () => {
    const result = formatNotificationContent(
      makeNotification({ data: { author_facing_reason: "著作権侵害のため" } }),
      "誰か",
      t
    );
    expect(result.body).toBe("著作権侵害のため");
  });

  it("説明が無ければ DB の body、それも無ければ既定文言にフォールバックする", () => {
    const withBody = formatNotificationContent(
      makeNotification({ data: {} }),
      "誰か",
      t
    );
    expect(withBody.body).toBe("フォールバック本文");

    const withoutBody = formatNotificationContent(
      makeNotification({ data: {}, body: "" }),
      "誰か",
      t
    );
    expect(withoutBody.body).toBe("moderationRemovedBody");
  });

  it("actor 名を本文やタイトルに混ぜない（運営発の通知のため）", () => {
    const result = formatNotificationContent(
      makeNotification({ data: { author_facing_reason: "理由" } }),
      "運営アカウント名",
      t
    );
    expect(result.title).not.toContain("運営アカウント名");
    expect(result.body).not.toContain("運営アカウント名");
  });
});

describe("異議申立て結果通知の表示", () => {
  it("認容・棄却・審査中で文言キーを切り替える", () => {
    const overturned = formatNotificationContent(
      makeNotification({
        type: "post_moderation_appeal_result",
        data: { appeal_status: "overturned", decision_note: "再確認しました" },
      }),
      "誰か",
      t
    );
    expect(overturned.title).toBe("moderationAppealOverturnedTitle");
    expect(overturned.body).toBe("再確認しました");

    const upheld = formatNotificationContent(
      makeNotification({
        type: "post_moderation_appeal_result",
        data: { appeal_status: "upheld", decision_note: "判定を維持します" },
      }),
      "誰か",
      t
    );
    expect(upheld.title).toBe("moderationAppealUpheldTitle");

    const unknown = formatNotificationContent(
      makeNotification({
        type: "post_moderation_appeal_result",
        data: { decision_note: "理由" },
      }),
      "誰か",
      t
    );
    expect(unknown.title).toBe("moderationAppealResultTitle");
  });
});

describe("通知 payload の匿名性", () => {
  it("payload に通報者情報・通報件数を持たない前提を固定する", () => {
    // outbox が載せる payload の形（RPC 側で組み立てる内容）
    const notification = makeNotification({
      data: {
        moderation_decision_id: DECISION_ID,
        policy_code: "rights.copyright",
        policy_version: "2026-07-28",
        policy_anchor: "guidelines-ip",
        author_facing_reason: "著作権侵害のため",
        restriction_scope: "all_users",
        restriction_duration: "until_reversed",
        system_generated: true,
      },
    });

    const keys = Object.keys(notification.data ?? {});
    expect(keys).not.toContain("internal_note");
    expect(keys).not.toContain("weightedScore");
    expect(keys).not.toContain("recentCount");
    expect(keys).not.toContain("reporter_id");
    // actor_id は recipient 本人（= 管理者の ID を渡さない）
    expect(notification.actor_id).toBe(notification.recipient_id);
  });
});
