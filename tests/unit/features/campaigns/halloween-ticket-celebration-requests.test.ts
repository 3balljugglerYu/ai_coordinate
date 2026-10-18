/**
 * 口数のお祝いを確かめてほしい、という合図(2026-10-17)。
 * 投稿のあとは、ほかの人の作品から作った投稿だけ確かめる(数えるのは元の作品 source_post_id)。
 */
import {
  getTicketCelebrationRequestCount,
  getTicketCelebrationRequestServerCount,
  requestTicketCelebrationCheck,
  requestTicketCelebrationCheckAfterPost,
  resetTicketCelebrationRequestsForTest,
  subscribeTicketCelebrationRequests,
} from "@/features/campaigns/halloween/lib/ticket-celebration-requests";
import type { PostImageResponse } from "@/features/posts/types";

beforeEach(() => {
  resetTicketCelebrationRequestsForTest();
});

describe("ticket-celebration-requests", () => {
  test("頼むたびに数が増え、聞いている側に知らせる。外したら知らせない", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeTicketCelebrationRequests(listener);
    requestTicketCelebrationCheck();
    requestTicketCelebrationCheck();
    expect(getTicketCelebrationRequestCount()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    requestTicketCelebrationCheck();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getTicketCelebrationRequestCount()).toBe(3);
  });

  test("サーバーで描くときは 0(合図は画面を開いてから)", () => {
    requestTicketCelebrationCheck();
    expect(getTicketCelebrationRequestServerCount()).toBe(0);
  });

  test.each([
    ["ほかの人の作品から作った投稿", { post: { source_post_id: "target-work-1" } }, 1],
    ["元の作品がない投稿(自分で作った)", { post: { source_post_id: null } }, 0],
    ["投稿のカードが返ってこなかった(どこから作ったか分からない)", { post: null }, 1],
    ["投稿のカードの欄がない", {}, 1],
  ])("投稿のあと: %s → %d回", (_label, response, expected) => {
    requestTicketCelebrationCheckAfterPost(response as Pick<PostImageResponse, "post">);
    expect(getTicketCelebrationRequestCount()).toBe(expected);
  });
});
