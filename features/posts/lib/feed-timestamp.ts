/**
 * フィードカードの投稿時刻表示。
 *
 * X と同じく、直近は相対表記(「2時間前」)、それより古いものは日付にする。
 * 相対表記のままだと「43日前」のように読み取りに手間がかかり、日付だけだと
 * 「今さっき投稿された」という鮮度が伝わらない。
 *
 * 文言は `Intl.RelativeTimeFormat` / `Intl.DateTimeFormat` に任せる。15言語ぶんの
 * 単位表記を自前で持つとメンテナンスが破綻するため。
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** ここを超えたら相対表記をやめて日付にする。 */
const RELATIVE_LIMIT_MS = 7 * DAY_MS;

/**
 * 投稿時刻を表示用の文字列にする。
 *
 * @param isoDate 投稿日時(ISO 文字列)。不正な値は空文字を返す
 * @param locale 表示ロケール
 * @param now 現在時刻(ミリ秒)。テストのために引数で受ける
 */
export function formatFeedTimestamp(
  isoDate: string | null | undefined,
  locale: string,
  now: number
): string {
  if (!isoDate) {
    return "";
  }
  const postedAt = Date.parse(isoDate);
  if (Number.isNaN(postedAt)) {
    return "";
  }

  // 端末の時計がずれていると未来の投稿になり得る。相対表記に倒して 0 秒扱いにする。
  const elapsed = Math.max(0, now - postedAt);

  if (elapsed < RELATIVE_LIMIT_MS) {
    const relative = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
      style: "narrow",
    });
    if (elapsed < MINUTE_MS) {
      return relative.format(-Math.floor(elapsed / 1000), "second");
    }
    if (elapsed < HOUR_MS) {
      return relative.format(-Math.floor(elapsed / MINUTE_MS), "minute");
    }
    if (elapsed < DAY_MS) {
      return relative.format(-Math.floor(elapsed / HOUR_MS), "hour");
    }
    return relative.format(-Math.floor(elapsed / DAY_MS), "day");
  }

  // 同じ年なら年を省く(X と同じ)。読む側にとって冗長なため。
  const posted = new Date(postedAt);
  const sameYear = posted.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(posted);
}
