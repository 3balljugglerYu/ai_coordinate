import type { Ga4EntryAccessRow } from "@/features/analytics/lib/ga4-types";

const ENTRY_ACCESS_OTHER_BUCKET = "__other__";
const LANDING_PAGE_COLORS = [
  "#0EA5E9",
  "#F97316",
  "#16A34A",
  "#7C3AED",
  "#64748B",
  "#14B8A6",
  "#A855F7",
] as const;

export type EntryAccessChartRow = {
  dateKey: string;
  dateLabel: string;
  totalSessions: number;
  [key: string]: string | number;
};

export type EntryAccessChartBarDefinition = {
  dataKey: string;
  fullLabel: string;
  legendLabel: string;
  color: string;
};

export type EntryAccessChartData = {
  chartRows: EntryAccessChartRow[];
  barDefinitions: EntryAccessChartBarDefinition[];
  labelsByDataKey: Record<string, string>;
};

function shortenPath(path: string, max = 28) {
  if (path.length <= max) {
    return path;
  }
  return `${path.slice(0, max - 1)}…`;
}

function formatDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function buildDateKeys(rows: Ga4EntryAccessRow[], dateKeys: string[]) {
  if (dateKeys.length > 0) {
    return dateKeys;
  }

  return Array.from(new Set(rows.map((row) => row.dateKey).filter(Boolean))).sort();
}

export function buildEntryAccessChart(
  rows: Ga4EntryAccessRow[],
  dateKeys: string[]
): EntryAccessChartData {
  const totalsByLandingPage = new Map<string, number>();
  const sessionsByDate = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!row.dateKey) {
      continue;
    }

    const landingPage = row.landingPage || "/";
    const sessions = Math.max(0, Number(row.sessions) || 0);

    totalsByLandingPage.set(
      landingPage,
      (totalsByLandingPage.get(landingPage) ?? 0) + sessions
    );

    const dateMap = sessionsByDate.get(row.dateKey) ?? new Map<string, number>();
    dateMap.set(landingPage, (dateMap.get(landingPage) ?? 0) + sessions);
    sessionsByDate.set(row.dateKey, dateMap);
  }

  const sortedLandingPages = Array.from(totalsByLandingPage.keys()).sort((a, b) => {
    if (a === ENTRY_ACCESS_OTHER_BUCKET) {
      return 1;
    }
    if (b === ENTRY_ACCESS_OTHER_BUCKET) {
      return -1;
    }

    const diff = (totalsByLandingPage.get(b) ?? 0) - (totalsByLandingPage.get(a) ?? 0);
    if (diff !== 0) {
      return diff;
    }

    return a.localeCompare(b);
  });

  const barDefinitions: EntryAccessChartBarDefinition[] = sortedLandingPages.map(
    (landingPage, index) => ({
      dataKey: `segment_${index}`,
      fullLabel:
        landingPage === ENTRY_ACCESS_OTHER_BUCKET ? "その他入口ページ" : landingPage,
      legendLabel:
        landingPage === ENTRY_ACCESS_OTHER_BUCKET
          ? "その他入口ページ"
          : shortenPath(landingPage, 20),
      color: LANDING_PAGE_COLORS[index % LANDING_PAGE_COLORS.length],
    })
  );

  const dataKeyByLandingPage = new Map(
    sortedLandingPages.map((landingPage, index) => [landingPage, `segment_${index}`])
  );

  const labelsByDataKey: Record<string, string> = {};
  for (const bar of barDefinitions) {
    labelsByDataKey[bar.dataKey] = bar.fullLabel;
  }

  const chartRows: EntryAccessChartRow[] = buildDateKeys(rows, dateKeys).map((dateKey) => {
    const dateMap = sessionsByDate.get(dateKey) ?? new Map<string, number>();
    const row: EntryAccessChartRow = {
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      totalSessions: 0,
    };

    for (const bar of barDefinitions) {
      row[bar.dataKey] = 0;
    }

    for (const [landingPage, sessions] of dateMap.entries()) {
      const dataKey = dataKeyByLandingPage.get(landingPage);
      if (!dataKey) {
        continue;
      }
      row[dataKey] = sessions;
      row.totalSessions += sessions;
    }

    return row;
  });

  return {
    chartRows,
    barDefinitions,
    labelsByDataKey,
  };
}
