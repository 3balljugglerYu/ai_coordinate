import {
  getRangeBounds,
  toJstDateKey,
  type DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { env } from "@/lib/env";
import { getGa4Client } from "./ga4-client";
import type { Ga4DashboardStatus, Ga4TopPageRow } from "./ga4-types";

/**
 * 追いかけたいページの数字を、**順位に関係なく**必ず出す。
 *
 * ## なぜ Top Pages では足りないのか
 *
 * Top Pages は上位8件しか出さない。ホーム・/style・/free・/posts/* が
 * 埋めるので、新設ページはまず入らない。**見たいページだけ見えない**。
 *
 * 上位N方式は「たまたま伸びたページ」を見つけるための道具で、
 * 「この施策のページがどうなったか」を追う用途には向かない。
 * (コレクション企画で訪問計測を別に作ったときと同じ構図)
 *
 * ## 追加するとき
 *
 * `WATCHLIST_PAGES` に1行足すだけ。ここが正本で、admin からは変えられない。
 * 追いかける対象はそう頻繁に変わらないので、設定画面を作るより
 * 1行足してデプロイする方が早い。
 *
 * ## 数え方
 *
 * GA4 Data API の `pagePath` は**クエリ文字列を含まない**。
 * `/use-prompts?amount=20` のような下見も同じ行に合算される。
 * 運営が見た回数は微々たるものなので、そのままにしている。
 */

export interface Ga4WatchlistPage {
  /** GA4 の pagePath と完全一致させる値。クエリは含めない。 */
  path: string;
  /** カードに出す名前。pagePath のままだと何のページか分からない。 */
  label: string;
}

export const WATCHLIST_PAGES: readonly Ga4WatchlistPage[] = [
  { path: "/use-prompts", label: "プロンプト利用の紹介" },
  { path: "/creator-rewards", label: "クリエイター還元の紹介" },
  { path: "/tools/image-split", label: "画像分割ツール" },
  { path: "/collections", label: "コレクション一覧" },
];

export interface Ga4WatchlistData {
  status: Ga4DashboardStatus;
  statusMessage: string | null;
  rows: Ga4TopPageRow[];
}

const EMPTY: Ga4WatchlistData = {
  status: "disabled",
  statusMessage: "GA4 の Property ID または認証情報が未設定です。",
  rows: [],
};

/**
 * 0件のページも**行として残す**。
 *
 * GA4 は数字が付かないページを返さない。返ってきたものだけを並べると、
 * 「まだ誰も来ていない」と「集計に失敗した」が見分けられなくなる。
 * 0 と書いてあれば、少なくとも数えには行ったことが分かる。
 */
function toRows(
  found: Map<string, { views: number; activeUsers: number }>
): Ga4TopPageRow[] {
  return WATCHLIST_PAGES.map((page) => {
    const hit = found.get(page.path);
    return {
      path: page.path,
      title: page.label,
      views: hit?.views ?? 0,
      activeUsers: hit?.activeUsers ?? 0,
    };
  });
}

/**
 * 注目ページの数字を引く。
 *
 * すべての範囲で Data API を使う(Top Pages は 24h だけ BigQuery を使うが、
 * こちらは BigQuery 未設定でも動くことを優先する)。24h は Data API の
 * 当日ぶんが遅れて入るため、**直近の数分は反映されない**。
 */
export async function getGa4WatchlistPages(
  range: DashboardRange
): Promise<Ga4WatchlistData> {
  if (!env.GA4_PROPERTY_ID) {
    return EMPTY;
  }

  const { currentStart, now } = getRangeBounds(range);

  try {
    const client = getGa4Client();
    const [report] = await client.runReport({
      property: `properties/${env.GA4_PROPERTY_ID}`,
      dateRanges: [
        { startDate: toJstDateKey(currentStart), endDate: toJstDateKey(now) },
      ],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      dimensionFilter: {
        filter: {
          fieldName: "pagePath",
          inListFilter: {
            values: WATCHLIST_PAGES.map((page) => page.path),
          },
        },
      },
      limit: WATCHLIST_PAGES.length,
      keepEmptyRows: false,
    });

    const found = new Map<string, { views: number; activeUsers: number }>();
    for (const row of report.rows ?? []) {
      const path = row.dimensionValues?.[0]?.value;
      if (!path) continue;
      found.set(path, {
        views: Number(row.metricValues?.[0]?.value ?? 0),
        activeUsers: Number(row.metricValues?.[1]?.value ?? 0),
      });
    }

    return { status: "ready", statusMessage: null, rows: toRows(found) };
  } catch (error) {
    console.error("Failed to fetch GA4 watchlist pages", error);
    return {
      status: "error",
      statusMessage:
        "GA4 から注目ページを取得できませんでした。Property ID と認証情報を確認してください。",
      rows: [],
    };
  }
}
