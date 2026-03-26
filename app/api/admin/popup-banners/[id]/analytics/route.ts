import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopupBannerById } from "@/features/popup-banners/lib/popup-banner-repository";
import { getPopupBannersRouteCopy } from "@/features/popup-banners/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import type {
  PopupBannerActionType,
  PopupBannerAnalyticsPoint,
  PopupBannerAnalyticsRow,
} from "@/features/popup-banners/lib/schema";

function isValidDateInput(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildDateBuckets(startDate: string, endDate: string): string[] {
  const buckets: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    buckets.push(toDateString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return buckets;
}

function buildAnalyticsPoints(
  rows: PopupBannerAnalyticsRow[],
  startDate: string,
  endDate: string
): PopupBannerAnalyticsPoint[] {
  const pointMap = new Map<string, PopupBannerAnalyticsPoint>();

  for (const bucket of buildDateBuckets(startDate, endDate)) {
    pointMap.set(bucket, {
      bucket,
      label: `${bucket.slice(5, 7)}/${bucket.slice(8, 10)}`,
      impression: 0,
      click: 0,
      close: 0,
      dismiss_forever: 0,
    });
  }

  for (const row of rows) {
    const point = pointMap.get(row.event_date);
    if (!point) {
      continue;
    }
    point[row.event_type as PopupBannerActionType] = row.count;
  }

  return Array.from(pointMap.values());
}

function resolveDateRange(request: NextRequest) {
  const daysValue = request.nextUrl.searchParams.get("days");
  const startValue = request.nextUrl.searchParams.get("start");
  const endValue = request.nextUrl.searchParams.get("end");

  if (isValidDateInput(startValue) && isValidDateInput(endValue)) {
    if (startValue > endValue) {
      return null;
    }

    return {
      startDate: startValue,
      endDate: endValue,
    };
  }

  const parsedDays = Number(daysValue ?? 7);
  const safeDays = parsedDays === 30 ? 30 : 7;
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - (safeDays - 1));

  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getPopupBannersRouteCopy(getRouteLocale(request));

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;

  try {
    const range = resolveDateRange(request);
    if (!range) {
      return NextResponse.json(
        { error: "日付範囲が不正です" },
        { status: 400 }
      );
    }

    const banner = await getPopupBannerById(id);
    if (!banner) {
      return NextResponse.json({ error: copy.notFound }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("popup_banner_analytics")
      .select("event_date, event_type, count")
      .eq("popup_banner_id", id)
      .gte("event_date", range.startDate)
      .lte("event_date", range.endDate)
      .order("event_date", { ascending: true });

    if (error) {
      console.error("[Admin Popup Banners] analytics error:", error);
      return NextResponse.json(
        { error: copy.analyticsFetchFailed },
        { status: 500 }
      );
    }

    return NextResponse.json(
      buildAnalyticsPoints(
        (data ?? []) as PopupBannerAnalyticsRow[],
        range.startDate,
        range.endDate
      )
    );
  } catch (error) {
    console.error("[Admin Popup Banners] analytics error:", error);
    return NextResponse.json(
      { error: copy.analyticsFetchFailed },
      { status: 500 }
    );
  }
}
