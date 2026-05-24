import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import { getGeneratedImagesForPicker } from "@/features/generation/lib/picker-server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseIntParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * 画像ソースピッカー「生成済み」タブ用 GET エンドポイント。
 *
 * クエリ: ?limit=50&offset=0 (limit は 1..100、超過/欠落時はクランプ)
 * レスポンス: { items: PickerSourceItem[], nextOffset: number | null }
 */
export async function GET(request: NextRequest) {
  await connection();
  const copy = getGenerationRouteCopy(getRouteLocale(request));

  const user = await getUser();
  if (!user) {
    return jsonError(copy.authRequired, "GENERATION_AUTH_REQUIRED", 401);
  }

  const limit = parseIntParam(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  );
  const offset = parseIntParam(
    request.nextUrl.searchParams.get("offset"),
    0,
    0,
    Number.MAX_SAFE_INTEGER
  );

  try {
    const result = await getGeneratedImagesForPicker({
      userId: user.id,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("generation-history picker fetch error:", error);
    return jsonError(
      copy.historyFetchFailed,
      "GENERATION_HISTORY_FETCH_FAILED",
      500
    );
  }
}
