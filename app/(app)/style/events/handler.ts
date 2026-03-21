import { NextRequest, NextResponse } from "next/server";
import { getStylePresetById } from "@/features/style/lib/presets";
import { getAllMessages } from "@/i18n/messages";
import { getUser } from "@/lib/auth";
import { getRouteLocale } from "@/lib/api/route-locale";
import {
  recordStyleUsageEvent,
  type StyleUsageAuthState,
  type StyleUsageEventType,
} from "@/features/style/lib/style-usage-events";

const STYLE_USAGE_EVENT_TYPES = new Set<StyleUsageEventType>([
  "visit",
  "generate",
  "download",
]);

interface StyleEventsRouteDependencies {
  getUserFn?: typeof getUser;
  recordStyleUsageEventFn?: typeof recordStyleUsageEvent;
}

function jsonError(message: string, errorCode: string, status: number) {
  return NextResponse.json({ error: message, errorCode }, { status });
}

function parseStyleUsageEventType(value: unknown): StyleUsageEventType | null {
  if (typeof value !== "string") {
    return null;
  }

  return STYLE_USAGE_EVENT_TYPES.has(value as StyleUsageEventType)
    ? (value as StyleUsageEventType)
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
    const recordStyleUsageEventFn =
      dependencies.recordStyleUsageEventFn ?? recordStyleUsageEvent;

    const user = await getUserFn();

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

    if (styleId && !getStylePresetById(styleId)) {
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
