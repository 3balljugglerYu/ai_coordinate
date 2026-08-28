import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSearchAvailable } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHashtag } from "@/lib/hashtag";

/**
 * 入力中のタグ候補（既存タグの前方一致）。
 *
 * 段階公開中は運営だけに返す。候補が無い場合と使えない場合はどちらも空配列で、
 * 応答の違いから公開前の機能の存在を推測させない。
 */

/** これより長い入力は候補を出さない。タグの上限と揃える。 */
const MAX_PREFIX_LENGTH = 50;

export async function GET(request: NextRequest) {
  await connection();

  const prefix = request.nextUrl.searchParams.get("prefix")?.trim() ?? "";
  // 長さはコードポイント単位で見る。コードユニットで数えると、サロゲートペアを
  // 含むタグ（𠮷 など）が実際の半分の長さで上限に当たる。
  if (!prefix || [...prefix].length > MAX_PREFIX_LENGTH) {
    return NextResponse.json({ hashtags: [] });
  }

  const user = await getUser();
  if (!user || !isSearchAvailable(user.id)) {
    return NextResponse.json({ hashtags: [] });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("search_hashtags", {
      // 正規化は TypeScript が正本。SQL 側で小文字化すると言語によって結果がズレる
      p_prefix: normalizeHashtag(prefix),
      p_limit: 8,
    });

    if (error) {
      console.error("Hashtag search failed:", error.message);
      return NextResponse.json({ hashtags: [] });
    }

    return NextResponse.json({ hashtags: data ?? [] });
  } catch (error) {
    console.error("Hashtag search failed:", error);
    return NextResponse.json({ hashtags: [] });
  }
}
