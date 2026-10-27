import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";
import { getPost } from "@/features/posts/lib/server-api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 投稿詳細の「User ORIGINAL で生成」カード（参照カード）の値を返す API。
 * ネイティブアプリの投稿詳細が、Web の詳細（`SourcePromptReferenceCard`）と同じカードを
 * 出すために使う。
 *
 * ## なぜ一覧の `POST /api/posts/prompt-actions` を広げないのか
 *
 * カードには原作の実寸と **生成前の画像（Before＝うちの子の元の写真）** が要る。
 * prompt-actions は未ログインでも50件ずつまとめて引け、全員ぶんを共有キャッシュに
 * 置いているので、そこへ載せると元の写真の URL を一括で集められる経路になり、
 * 「生成前の画像も表示する」を外しても共有キャッシュが切れるまで返し続けてしまう
 * （PR #818 のレビューで取りやめた）。
 *
 * ここは Web の詳細と同じ `getPost` を通す。見られるかどうか（未投稿は本人だけ・
 * 公開停止・ブロック・通報済み）も、本人の下書きを原作にした派生の例外も、
 * Web の詳細とまったく同じになる。`getPost` の結果は閲覧者ごとで、共有キャッシュには
 * 置かない。
 *
 * ## 返すもの
 *
 * `{ reference }`。`SourcePromptReference`（可否・原作者・サムネイル・実寸・Before・
 * 利用数・公開設定）か null。**プロンプト本文は含まない**（PROMPT-SECRECY-001。
 * 本文は `/api/posts/[id]/prompt-text` が認可してから返す）。
 * 投稿が見られないときは理由を区別せず 404 にする（状態を推測させない）。
 * 未ログインでも呼べる（Web の詳細も未ログインでカードを出す）。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const { id } = await params;
    if (!id || !UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const user = await getUser();
    // 閲覧数は数えない（カードの値を取りに来ただけで、詳細の表示は別に数える）
    const post = await getPost(id, user?.id ?? null, true);
    if (!post) {
      return NextResponse.json(
        { error: copy.promptTextUnavailable, errorCode: "POSTS_NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } }
      );
    }

    return NextResponse.json(
      { reference: post.source_reference ?? null },
      // 閲覧者ごとの結果なので、途中のキャッシュに残さない
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[source-reference] unexpected error:", error);
    return NextResponse.json(
      { error: copy.postsFetchFailed, errorCode: "POSTS_SOURCE_REFERENCE_FAILED" },
      { status: 500 }
    );
  }
}
