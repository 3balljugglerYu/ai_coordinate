import "server-only";

import type { NextRequest } from "next/server";
import { getPopupBannerClientIpHash } from "@/features/popup-banners/lib/popup-banner-client-ip";

/**
 * style_usage_events.viewer_key を解決する。
 *
 * ログイン: `u:<user_id>` / ゲスト: `g:<ip_hash>`。
 * post_impressions・home_view_events と同じ形式にそろえてある(将来の突き合わせのため)。
 *
 * **必ずサーバー側で解決する。** body から受け取るとゲストUUを膨らませられる。
 * IP が取れないゲストは null を返す(件数は数えるが UU には数えない)。
 */
export function resolveStyleUsageViewerKey(
  request: NextRequest,
  userId: string | null,
): string | null {
  if (userId) {
    return `u:${userId}`;
  }
  const ipHash = getPopupBannerClientIpHash(request);
  return ipHash ? `g:${ipHash}` : null;
}
