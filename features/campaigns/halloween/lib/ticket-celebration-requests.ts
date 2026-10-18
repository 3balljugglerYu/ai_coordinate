import type { PostImageResponse } from "@/features/posts/types";

/**
 * ハロウィン企画の「口数のお祝い」を確かめてほしい、という合図(2026-10-17 ユーザー決定)。
 *
 * お祝いのモーダルを出すのは、投稿の完了を受け持つ PostProgressHost の中(アプリに1つ)だけ。
 * 合図を出すのは、投稿が終わったとき(PostProgressHost)と、企画ページで進み具合を読んだとき・
 * エントリーしたとき(EntryProgressCard)。出す場所を1か所にまとめるので、同じお祝いが
 * 2枚重なって出ることはない。
 */

let requestCount = 0;
const listeners = new Set<() => void>();

export function requestTicketCelebrationCheck(): void {
  requestCount += 1;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * 投稿が終わったとき。口数が増えるのは、ほかの人の作品から作った投稿だけ
 * (get_hashtag_campaign_progress は元の作品 source_post_id で数える)なので、それ以外は確かめない。
 * 投稿のカードが返ってこなかったとき(作るのに失敗)は、どこから作ったか分からないので確かめる。
 */
export function requestTicketCelebrationCheckAfterPost(response: Pick<PostImageResponse, "post">): void {
  if (response.post && !response.post.source_post_id) {
    return;
  }
  requestTicketCelebrationCheck();
}

export function subscribeTicketCelebrationRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTicketCelebrationRequestCount(): number {
  return requestCount;
}

export function getTicketCelebrationRequestServerCount(): number {
  return 0;
}

export function resetTicketCelebrationRequestsForTest(): void {
  requestCount = 0;
}
