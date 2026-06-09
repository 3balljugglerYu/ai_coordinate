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
import { getAdminPreviewUserIds, getAdminUserIds } from "@/lib/env";

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
      | { eventType?: unknown; styleId?: unknown }
      | null;
    const eventType = parseStyleUsageEventType(payload?.eventType);

    if (!eventType) {
      return jsonError(copy.invalidUsageEvent, "STYLE_INVALID_USAGE_EVENT", 400);
    }

    const styleId =
      typeof payload?.styleId === "string" && payload.styleId.trim().length > 0
        ? payload.styleId.trim()
        : null;

    if (
      styleId &&
      !(await getPublishedStylePresetByIdFn(styleId, { includeAdminOnly }))
    ) {
      return jsonError(copy.invalidStylePreset, "STYLE_INVALID_STYLE", 400);
    }

    const authState: StyleUsageAuthState = user ? "authenticated" : "guest";

    await recordStyleUsageEventFn({
      userId: user?.id ?? null,
      authState,
      eventType,
      styleId,
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
