import type {
  DashboardDeltaDirection,
  DashboardOneTapStyleAnalytics,
  DashboardOneTapStyleMetric,
  DashboardOneTapStyleSummary,
  DashboardOneTapStyleTrendPoint,
} from "./dashboard-types";
import {
  enumerateJstDateKeys,
  formatJstDateLabel,
  isWithinDateRange,
  toJstDateKey,
} from "./dashboard-range";

export interface StyleUsageEventRow {
  user_id: string | null;
  auth_state?: string | null;
  event_type: string;
  style_id: string | null;
  created_at: string;
}

export interface StyleSignupProfileRow {
  created_at: string;
  signup_source?: string | null;
}

type OneTapStyleMetricKey = DashboardOneTapStyleMetric["key"];

function calculateDelta(current: number, previous: number): {
  deltaPct: number | null;
  deltaDirection: DashboardDeltaDirection;
} {
  if (previous === 0) {
    if (current === 0) {
      return { deltaPct: 0, deltaDirection: "flat" };
    }

    return { deltaPct: null, deltaDirection: "up" };
  }

  const deltaPct = Number(
    (((current - previous) / previous) * 100).toFixed(1)
  );

  if (deltaPct > 0) {
    return { deltaPct, deltaDirection: "up" };
  }

  if (deltaPct < 0) {
    return {
      deltaPct: Math.abs(deltaPct),
      deltaDirection: "down",
    };
  }

  return { deltaPct: 0, deltaDirection: "flat" };
}

function countEvents(
  rows: StyleUsageEventRow[],
  eventType: string,
  start: Date,
  end: Date
) {
  return rows.filter(
    (row) =>
      row.event_type === eventType &&
      isWithinDateRange(row.created_at, start, end)
  ).length;
}

function createMetric(params: {
  key: OneTapStyleMetricKey;
  label: string;
  currentCount: number;
  previousCount: number;
}): DashboardOneTapStyleMetric {
  const { deltaPct, deltaDirection } = calculateDelta(
    params.currentCount,
    params.previousCount
  );

  return {
    key: params.key,
    label: params.label,
    currentCount: params.currentCount,
    previousCount: params.previousCount,
    deltaPct,
    deltaDirection,
  };
}

function countProfiles(
  rows: StyleSignupProfileRow[],
  signupSource: string,
  start: Date,
  end: Date
) {
  return rows.filter(
    (row) =>
      row.signup_source === signupSource &&
      isWithinDateRange(row.created_at, start, end)
  ).length;
}

export function buildOneTapStyleSummary(params: {
  events: StyleUsageEventRow[];
  profiles: StyleSignupProfileRow[];
  currentStart: Date;
  previousStart: Date;
  now: Date;
}): DashboardOneTapStyleSummary {
  const visitsCurrent = countEvents(
    params.events,
    "visit",
    params.currentStart,
    params.now
  );
  const visitsPrevious = countEvents(
    params.events,
    "visit",
    params.previousStart,
    params.currentStart
  );
  const generationsCurrent = countEvents(
    params.events,
    "generate",
    params.currentStart,
    params.now
  );
  const generationsPrevious = countEvents(
    params.events,
    "generate",
    params.previousStart,
    params.currentStart
  );
  const signupClicksCurrent = countEvents(
    params.events,
    "signup_click",
    params.currentStart,
    params.now
  );
  const signupClicksPrevious = countEvents(
    params.events,
    "signup_click",
    params.previousStart,
    params.currentStart
  );
  const signupCompletionsCurrent = countProfiles(
    params.profiles,
    "style",
    params.currentStart,
    params.now
  );
  const signupCompletionsPrevious = countProfiles(
    params.profiles,
    "style",
    params.previousStart,
    params.currentStart
  );

  return {
    metrics: [
      createMetric({
        key: "visits",
        label: "訪問数",
        currentCount: visitsCurrent,
        previousCount: visitsPrevious,
      }),
      createMetric({
        key: "generations",
        label: "生成成功数",
        currentCount: generationsCurrent,
        previousCount: generationsPrevious,
      }),
      createMetric({
        key: "signupClicks",
        label: "新規登録CTAクリック数",
        currentCount: signupClicksCurrent,
        previousCount: signupClicksPrevious,
      }),
      createMetric({
        key: "signupCompletions",
        label: "新規登録完了数",
        currentCount: signupCompletionsCurrent,
        previousCount: signupCompletionsPrevious,
      }),
    ],
  };
}

function buildOneTapStyleTrend(params: {
  events: StyleUsageEventRow[];
  profiles: StyleSignupProfileRow[];
  currentStart: Date;
  now: Date;
}): DashboardOneTapStyleTrendPoint[] {
  const keys = enumerateJstDateKeys(params.currentStart, params.now);
  const trendMap = new Map<string, DashboardOneTapStyleTrendPoint>(
    keys.map((key) => [
      key,
      {
        bucket: key,
        label: formatJstDateLabel(key),
        visits: 0,
        generations: 0,
        signupClicks: 0,
        signupCompletions: 0,
      },
    ])
  );

  for (const event of params.events) {
    if (!isWithinDateRange(event.created_at, params.currentStart, params.now)) {
      continue;
    }

    const bucket = trendMap.get(toJstDateKey(event.created_at));
    if (!bucket) {
      continue;
    }

    if (event.event_type === "visit") {
      bucket.visits += 1;
      continue;
    }

    if (event.event_type === "generate") {
      bucket.generations += 1;
      continue;
    }

    if (event.event_type === "signup_click") {
      bucket.signupClicks += 1;
    }
  }

  for (const profile of params.profiles) {
    if (
      profile.signup_source !== "style" ||
      !isWithinDateRange(profile.created_at, params.currentStart, params.now)
    ) {
      continue;
    }

    const bucket = trendMap.get(toJstDateKey(profile.created_at));
    if (!bucket) {
      continue;
    }

    bucket.signupCompletions += 1;
  }

  return keys.map((key) => trendMap.get(key)!);
}

export function buildOneTapStyleAnalytics(params: {
  events: StyleUsageEventRow[];
  profiles: StyleSignupProfileRow[];
  currentStart: Date;
  previousStart: Date;
  now: Date;
}): DashboardOneTapStyleAnalytics {
  return {
    summary: buildOneTapStyleSummary(params),
    trend: buildOneTapStyleTrend({
      events: params.events,
      profiles: params.profiles,
      currentStart: params.currentStart,
      now: params.now,
    }),
  };
}
