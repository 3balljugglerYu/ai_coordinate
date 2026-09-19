import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { userStylesRouteCopy } from "@/features/user-styles/lib/route-copy";
import {
  recordStyleUsageEvent,
  type StyleUsageAuthState,
  type StyleUsageEventType,
} from "@/features/style/lib/style-usage-events";
import { resolveStyleUsageViewerKey } from "@/features/style/lib/style-usage-viewer-key";

/**
 * User ORIGINAL(/user-styles)の計測。
 *
 * ## なぜ /style/events を使わないのか
 *
 * `recordStyleUsageEvent` は server-only で、クライアントからは
 * `app/(app)/style/events` 経由でしか送れない。だがあちらの許可集合は
 * `visit / download / generate / signup_click / wardrobe_save_click` の**固定5値**で、
 * 未知の値は 400 になる（PR #638 レビュー#4）。
 *
 * ⭐ **あちらの許可集合を広げない。** /style 用の入口で、役割が違う。
 * ここは `user_styles_visit` / `user_styles_chip` **だけ**を通す専用の入口にする。
 *
 * ## 何を測り、何を測らないか
 *
 * 測るのは**訪問とチップ選択だけ**。「ここから生成に至ったか」は測れない
 * ── `prompt_usage_events` は入口ページも選択チップも保存しないため。
 * 測れるようにするには生成シートと生成系 RPC に手を入れることになり、
 * この計画の「既存を変えない」方針とは引き換えにしない（計画書 §12 レビュー#7）。
 */
const ALLOWED_EVENT_TYPES = new Set<StyleUsageEventType>([
  "user_styles_visit",
  "user_styles_chip",
]);

/**
 * `category_key` に入れるチップ識別子。
 *
 * 列の CHECK（`^[a-z][a-z0-9_]{1,49}$`）を満たす値だけを、さらに**既知のチップに限定**する。
 * 自由入力を通すと、集計時に値が散らばって数えられなくなる。
 * 作者チップは作者IDごとに分けず `author` にまとめる（誰を押したかではなく、
 * 「作者チップという導線が使われたか」を見たいため）。
 */
const ALLOWED_CHIPS = new Set(["all", "usage", "author"]);

export async function POST(request: NextRequest) {
  const copy = userStylesRouteCopy[getRouteLocale(request)];

  try {
    const user = await getUser();
    if (!isUserStylesAvailable(user?.id)) {
      return new NextResponse(null, { status: 404 });
    }

    const payload = (await request.json().catch(() => null)) as
      | { eventType?: unknown; chip?: unknown }
      | null;

    const eventType =
      typeof payload?.eventType === "string" &&
      ALLOWED_EVENT_TYPES.has(payload.eventType as StyleUsageEventType)
        ? (payload.eventType as StyleUsageEventType)
        : null;

    if (!eventType) {
      return jsonError(copy.invalidEvent, "USER_STYLES_INVALID_EVENT", 400);
    }

    const chipRaw = typeof payload?.chip === "string" ? payload.chip.trim() : "";
    const chip = ALLOWED_CHIPS.has(chipRaw) ? chipRaw : null;

    // チップ識別子は user_styles_chip のときだけ意味を持つ。
    // visit に付いていると、訪問数とチップ選択数が同じキーで混ざる。
    const categoryKey = eventType === "user_styles_chip" ? chip : null;

    const authState: StyleUsageAuthState = user ? "authenticated" : "guest";

    // ⭐ viewer_key は**サーバー側でのみ**解決する。body から受け取るとゲストUUを膨らませられる。
    const viewerKey = resolveStyleUsageViewerKey(request, user?.id ?? null);

    await recordStyleUsageEvent({
      userId: user?.id ?? null,
      authState,
      eventType,
      // この画面はプリセットに紐づかないので style_id は常に null。
      styleId: null,
      categoryKey,
      viewerKey,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("User style events route error", error);
    return jsonError(copy.internalError, "USER_STYLES_INTERNAL_ERROR", 500);
  }
}
