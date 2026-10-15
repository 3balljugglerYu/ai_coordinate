/**
 * ハッシュタグ企画(つかう人の抽選)の口数と進捗。進捗カードと API が共有する。
 *
 * 「何作品使ったか」は DB の get_hashtag_campaign_progress が数える(ちがう応募作の数。
 * 同じ作者でも投稿が違えば別に数える)。ここは、その数を口数とバーに直すだけ。
 */

/** 口数のしきい値(例: 3作品で1口)。 */
export interface TicketTier {
  works: number;
  tickets: number;
}

/** 届いたしきい値のうち、いちばん多い口数。どこにも届いていなければ 0。 */
export function ticketsForWorks(works: number, tiers: readonly TicketTier[]): number {
  let tickets = 0;
  for (const tier of tiers) {
    if (works >= tier.works && tier.tickets > tickets) {
      tickets = tier.tickets;
    }
  }
  return tickets;
}

/** 次に届くしきい値。すべて届いていたら null。 */
export function nextTicketTier(works: number, tiers: readonly TicketTier[]): TicketTier | null {
  let next: TicketTier | null = null;
  for (const tier of tiers) {
    if (works < tier.works && (next === null || tier.works < next.works)) {
      next = tier;
    }
  }
  return next;
}

/** GET /api/hashtag-campaigns/[key]/progress の返り値。 */
export interface HashtagCampaignProgressResponse {
  /** ISO 8601。数え始め(この時刻を含む) */
  startsAt: string;
  /** ISO 8601。数え終わり(この時刻ちょうどは含まない) */
  endsAt: string;
  /** 未ログインなら null */
  viewer: {
    /** エントリーした日時。未エントリーなら null */
    enteredAt: string | null;
    /** 使ったちがう応募作の数(エントリー前の投稿も含む) */
    usedWorks: number;
    /** お祝いをどこまで出したか(口数) */
    celebratedTickets: number;
  } | null;
}

/** POST /api/hashtag-campaigns/[key]/entry の返り値。 */
export interface HashtagCampaignEntryResponse {
  enteredAt: string;
}
