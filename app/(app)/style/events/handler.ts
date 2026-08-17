import { NextRequest, NextResponse } from "next/server";
import { getAllMessages } from "@/i18n/messages";
import { jsonError } from "@/lib/api/json-error";
import { getUser } from "@/lib/auth";
import { getRouteLocale } from "@/lib/api/route-locale";
import {
  recordStyleUsageEvent,
  type StyleUsageAuthState,
  type StylePublicUsageEventType,
} from "@/features/style/lib/style-usage-events";
import { getPublishedStylePresetById } from "@/features/style-presets/lib/style-preset-repository";
import { shouldRecordStylePresetUsage } from "@/features/style-presets/lib/style-preset-usage-recording";
import { getAdminPreviewUserIds, getAdminUserIds } from "@/lib/env";
import { resolveStyleUsageViewerKey } from "@/features/style/lib/style-usage-viewer-key";

const STYLE_USAGE_EVENT_TYPES = new Set<StylePublicUsageEventType>([
  "visit",
  "download",
  "generate",
  "signup_click",
  "wardrobe_save_click",
]);

interface StyleEventsRouteDependencies {
  getUserFn?: typeof getUser;
  getAdminUserIdsFn?: typeof getAdminUserIds;
  getPublishedStylePresetByIdFn?: typeof getPublishedStylePresetById;
  recordStyleUsageEventFn?: typeof recordStyleUsageEvent;
}

function parseStyleUsageEventType(
  value: unknown
): StylePublicUsageEventType | null {
  if (typeof value !== "string") {
    return null;
  }

  return STYLE_USAGE_EVENT_TYPES.has(value as StylePublicUsageEventType)
    ? (value as StylePublicUsageEventType)
    : null;
}

export async function postStyleEventsRoute(
  request: NextRequest,
  dependencies: StyleEventsRouteDependencies = {}
) {
  const locale = getRouteLocale(request);
  const copy = (await getAllMessages(locale)).style;

  try {
    const getUserFn = dependencies.getUserFn ?? getUser;
    const getPublishedStylePresetByIdFn =
      dependencies.getPublishedStylePresetByIdFn ??
      getPublishedStylePresetById;
    const getAdminUserIdsFn =
      dependencies.getAdminUserIdsFn ?? getAdminUserIds;
    const recordStyleUsageEventFn =
      dependencies.recordStyleUsageEventFn ?? recordStyleUsageEvent;

    const user = await getUserFn();
    // フル admin + プレビュー admin の両方が admin_only preset を閲覧/イベント記録可能。
    const previewIds = getAdminPreviewUserIds();
    const includeAdminOnly = !!user && (
      getAdminUserIdsFn().includes(user.id) || previewIds.includes(user.id)
    );

    const payload = (await request.json().catch(() => null)) as
      | { eventType?: unknown; styleId?: unknown; categoryKey?: unknown }
      | null;
    const eventType = parseStyleUsageEventType(payload?.eventType);

    if (!eventType) {
      return jsonError(copy.invalidUsageEvent, "STYLE_INVALID_USAGE_EVENT", 400);
    }

    const styleId =
      typeof payload?.styleId === "string" && payload.styleId.trim().length > 0
        ? payload.styleId.trim()
        : null;

    /*
      企画単位の集計キー。visit は style_id だけでは企画に紐づかないため
      これを正本にする。書式は preset_categories.key と同じ
      (DB の CHECK 制約 style_usage_events_category_key_format_check と一致させる)。
    */
    const categoryKeyRaw =
      typeof payload?.categoryKey === "string" ? payload.categoryKey.trim() : "";
    const categoryKey = /^[a-z][a-z0-9_]{1,49}$/.test(categoryKeyRaw)
      ? categoryKeyRaw
      : null;

    if (styleId) {
      const preset = await getPublishedStylePresetByIdFn(styleId, {
        includeAdminOnly,
      });
      if (!preset) {
        return jsonError(copy.invalidStylePreset, "STYLE_INVALID_STYLE", 400);
      }
      // 公開中でないプリセット(admin の公開前テスト・表示期間外等)に紐づく
      // 利用イベントは記録しない(「◯◯回つくられました」カウンタ/KPI への混入防止)。
      // トラッキングは UX に影響させない方針のため、エラーではなく ok で応答する。
      // 非 admin は上の取得(includeAdminOnly=false)で既に 400 になるため、
      // ここに到達してスキップされるのは実質 admin の公開前テストのみ。
      if (!shouldRecordStylePresetUsage(preset)) {
        return NextResponse.json({ ok: true });
      }
    }

    const authState: StyleUsageAuthState = user ? "authenticated" : "guest";

    // viewer_key は**サーバー側でのみ**解決する(body から受け取ると偽装できる)。
    // IP が取れないゲストは null = 件数には数えるが UU には数えない。
    const viewerKey = resolveStyleUsageViewerKey(request, user?.id ?? null);

    await recordStyleUsageEventFn({
      userId: user?.id ?? null,
      authState,
      eventType,
      styleId,
      categoryKey,
      viewerKey,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Style events route error", error);
    return jsonError(copy.internalError, "STYLE_EVENTS_INTERNAL_ERROR", 500);
  }
}

export const styleEventsRouteHandlers = {
  postStyleEventsRoute,
};
