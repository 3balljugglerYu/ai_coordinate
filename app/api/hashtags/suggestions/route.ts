import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSearchAvailable } from "@/lib/env";
import { getHashtagSuggestions } from "@/features/posts/lib/hashtag-suggestions";
import { isUuid } from "@/lib/is-uuid";

/**
 * 投稿時に出すタグ候補。
 *
 * 段階公開中は運営だけに返す（UI を閉じても直接叩けるため、検索と同じ判定を
 * ここでも通す）。候補が無いことと使えないことは区別せず、どちらも空配列で返す
 * ＝ 公開前の機能の存在を、応答の違いから推測させない。
 */
export async function GET(request: NextRequest) {
  await connection();

  const imageId = request.nextUrl.searchParams.get("imageId");
  if (!imageId || !isUuid(imageId)) {
    return NextResponse.json({ suggestions: [] });
  }

  const user = await getUser();
  if (!user || !isSearchAvailable(user.id)) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await getHashtagSuggestions(user.id, imageId);
  return NextResponse.json({ suggestions });
}
