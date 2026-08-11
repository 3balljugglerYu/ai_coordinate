import { formatFeedTimestamp } from "@/features/posts/lib/feed-timestamp";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatFeedTimestamp", () => {
  test("空・不正な値は空文字", () => {
    expect(formatFeedTimestamp(null, "ja", NOW)).toBe("");
    expect(formatFeedTimestamp(undefined, "ja", NOW)).toBe("");
    expect(formatFeedTimestamp("not-a-date", "ja", NOW)).toBe("");
  });

  test("1分未満は秒、1時間未満は分、1日未満は時間で表す", () => {
    expect(formatFeedTimestamp(isoAgo(30 * SECOND), "ja", NOW)).toContain("30");
    expect(formatFeedTimestamp(isoAgo(5 * MINUTE), "ja", NOW)).toContain("5");
    expect(formatFeedTimestamp(isoAgo(3 * HOUR), "ja", NOW)).toContain("3");
  });

  test("1日以上7日未満は日で表す", () => {
    expect(formatFeedTimestamp(isoAgo(3 * DAY), "ja", NOW)).toContain("3");
  });

  test("7日以上は日付にする(相対表記のままだと読み取りに手間がかかるため)", () => {
    // 8日前 = 2026-08-02。相対表記に出てくる「8」ではなく月日が含まれる
    const label = formatFeedTimestamp(isoAgo(8 * DAY), "ja", NOW);
    expect(label).toContain("8");
    expect(label).toContain("2");
    // 同じ年なので年は出さない
    expect(label).not.toContain("2026");
  });

  test("年をまたぐ投稿には年を出す", () => {
    const label = formatFeedTimestamp("2025-12-01T00:00:00.000Z", "ja", NOW);
    expect(label).toContain("2025");
  });

  test("未来日時(端末の時計ずれ)でも壊れず相対表記に倒す", () => {
    const label = formatFeedTimestamp(
      new Date(NOW + 10 * MINUTE).toISOString(),
      "ja",
      NOW
    );
    expect(label).not.toBe("");
    // 「10分後」ではなく経過0として扱う
    expect(label).not.toContain("10");
  });

  test("ロケールに応じた表記になる", () => {
    const ja = formatFeedTimestamp(isoAgo(3 * HOUR), "ja", NOW);
    const en = formatFeedTimestamp(isoAgo(3 * HOUR), "en", NOW);
    expect(ja).not.toBe(en);
  });
});
