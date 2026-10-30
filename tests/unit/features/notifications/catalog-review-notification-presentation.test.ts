/** @jest-environment node */

/**
 * 見本(参照画像)つきの作品の審査の結果の通知(i2i カタログ Phase 4)。
 *
 * ここで守ること:
 *  - 承認・作り直しの通知は、種類から言語ごとの文言を組み立てる(記録の日本語の本文をそのまま出さない)
 *  - 作り直しの理由は、分類の文言(翻訳する)・作り直しの案内・運営が書いた説明(原文)の順に並べる
 *    (一覧は2行で切るので、案内を長くなりうる説明より前に)。分類が分からなければ分類は出さない
 *  - 審査した運営を見せない(actor の名前を出さない通知の種類に入る)
 */

import { formatNotificationContent } from "@/features/notifications/lib/presentation";
import { isAnonymousActorNotificationType } from "@/features/notifications/types";
import type { Notification } from "@/features/notifications/types";

const USER = "11111111-1111-4111-8111-111111111111";
const t = ((key: string) => key) as never;

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: "n1",
    recipient_id: USER,
    actor_id: USER,
    type: "catalog_review_approved",
    entity_type: "post",
    entity_id: "22222222-2222-4222-8222-222222222222",
    title: "公開できるようになりました",
    body: "記録の本文",
    data: {},
    is_read: false,
    read_at: null,
    created_at: "2026-10-30T00:00:00.000Z",
    ...overrides,
  } as Notification;
}

test("承認の通知は、言語ごとの題名と本文を使う", () => {
  expect(formatNotificationContent(notification({}), "", t)).toEqual({
    title: "catalogReviewApprovedTitle",
    body: "catalogReviewApprovedBody",
  });
});

test.each([
  ["official_or_others_work", "catalogReviewReasonOfficialOrOthersWork"],
  ["real_person", "catalogReviewReasonRealPerson"],
  ["sexual_or_violent", "catalogReviewReasonSexualOrViolent"],
  ["other", "catalogReviewReasonOther"],
])("作り直しの通知は、分類 %s の文言と運営の説明を並べる", (category, key) => {
  const content = formatNotificationContent(
    notification({ type: "catalog_review_rejected", data: { reason_category: category, reason: "髪飾りが公式のもの" } }),
    "",
    t,
  );

  expect(content).toEqual({
    title: "catalogReviewRejectedTitle",
    body: `${key} catalogReviewRejectedBody 髪飾りが公式のもの`,
  });
});

test("分類が分からず説明も無ければ、作り直しの案内だけ", () => {
  expect(
    formatNotificationContent(
      notification({ type: "catalog_review_rejected", data: { reason_category: "unknown" } }),
      "",
      t,
    ).body,
  ).toBe("catalogReviewRejectedBody");
});

test("分類が無く説明だけのときは、案内と説明", () => {
  expect(
    formatNotificationContent(
      notification({ type: "catalog_review_rejected", data: { reason: "手の形" } }),
      "",
      t,
    ).body,
  ).toBe("catalogReviewRejectedBody 手の形");
});

test("分類に Object の名前(toString など)が来ても、分類として扱わない", () => {
  expect(
    formatNotificationContent(
      notification({ type: "catalog_review_rejected", data: { reason_category: "toString" } }),
      "",
      t,
    ).body,
  ).toBe("catalogReviewRejectedBody");
});

test("審査した運営を見せない(actor の名前を出さない種類)", () => {
  expect(isAnonymousActorNotificationType("catalog_review_approved")).toBe(true);
  expect(isAnonymousActorNotificationType("catalog_review_rejected")).toBe(true);
});
