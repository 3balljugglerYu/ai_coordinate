export type DashboardRange = "24h" | "7d" | "30d" | "90d";

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const RANGE_TO_DURATION_MS: Record<DashboardRange, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

export const DASHBOARD_RANGE_OPTIONS: Array<{
  value: DashboardRange;
  label: string;
}> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export function parseDashboardRange(value?: string): DashboardRange {
  if (value === "24h" || value === "7d" || value === "30d" || value === "90d") {
    return value;
  }

  return "30d";
}

export function getRangeBounds(range: DashboardRange, now = new Date()) {
  const durationMs = RANGE_TO_DURATION_MS[range];
  const currentStart = new Date(now.getTime() - durationMs);
  const previousStart = new Date(currentStart.getTime() - durationMs);

  return {
    range,
    now,
    durationMs,
    currentStart,
    previousStart,
    currentStartIso: currentStart.toISOString(),
    previousStartIso: previousStart.toISOString(),
    nowIso: now.toISOString(),
  };
}

export function isWithinDateRange(
  value: string,
  start: Date,
  end: Date
): boolean {
  const timestamp = new Date(value).getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

export function toJstDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatJstDateLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function enumerateJstDateKeys(start: Date, end: Date): string[] {
  const current = new Date(start.getTime() + JST_OFFSET_MS);
  const last = new Date(end.getTime() + JST_OFFSET_MS);

  current.setUTCHours(0, 0, 0, 0);
  last.setUTCHours(0, 0, 0, 0);

  const keys: string[] = [];

  while (current.getTime() <= last.getTime()) {
    keys.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return keys;
}
