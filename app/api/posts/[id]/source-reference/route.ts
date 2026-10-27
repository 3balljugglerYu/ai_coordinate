import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFullAdmin } from "@/lib/env";
import { isUuid } from "@/lib/is-uuid";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";
import { canViewerSeePost } from "@/features/posts/lib/post-viewer-gate";
import {
  applyViewerToSourceReference,
  resolveSourcePromptReference,
} from "@/features/posts/lib/source-prompt-reference";

/** 閲覧者ごとの結果なので、成功も失敗も途中のキャッシュに残さない。 */
const NO_STORE = { "Cache-Control": "private, no-store" };

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
 * ## 決まり（投稿詳細と同じ部品を使う）
 *
 * 1. 投稿を見せてよいか: `canViewerSeePost`（`getPost` と同じ。未投稿は本人だけ・
 *    公開停止・ブロック・通報済み）。見せられなければ理由を区別せず 404。
 * 2. カード: `resolveSourcePromptReference` → `applyViewerToSourceReference`
 *    （原作が取り消し・公開停止になっていたり、原作者とブロックし合っていたりすれば
 *    「使えない」にして、サムネイルと Before を返さない。原作者本人は除く）。
 *
 * `getPost` そのものは呼ばない。プロフィール・いいね数・実寸の補完・プロンプトの解決まで
 * 走らせてカードだけを使うのは重く（公開・キャッシュなしの経路で DB の負荷になる）、
 * 本文を読み込まないこの形のほうが秘匿の面でも安全なため。
 *
 * ## 返すもの
 *
 * `{ reference }`。`SourcePromptReference`（可否・原作者・サムネイル・実寸・Before・
 * 利用数・公開設定）か null（参照カードの無い投稿）。**プロンプト本文は含まない**
 * （PROMPT-SECRECY-001。本文は `/api/posts/[id]/prompt-text` が認可してから返す）。
 * 未ログインでも呼べる（Web の詳細も未ログインでカードを出す）。
 */
function notFound(message: string) {
  return NextResponse.json(
    { error: message, errorCode: "POSTS_NOT_FOUND" },
    { status: 404, headers: NO_STORE }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const { id } = await params;
    if (!id || !isUuid(id)) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400, headers: NO_STORE }
      );
    }

    const user = await getUser();
    const viewerId = user?.id ?? null;
    // 投稿詳細と同じく admin で読み、見せてよいかは canViewerSeePost で決める
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from("generated_images")
      .select("id, user_id, is_posted, moderation_status, generation_type, source_post_id, source_author_id")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!row) {
      return notFound(copy.postNotFound);
    }

    const isModerator = isFullAdmin(viewerId);
    // カードは見せてよいかと並べて解く(見せられなければ捨てる)。カードの失敗は
    // 投稿詳細と同じく「カードなし」にする(詳細全体を失敗にしない)
    const [canSee, reference] = await Promise.all([
      canViewerSeePost(supabase, row, viewerId, isModerator),
      resolveSourcePromptReference(row, supabase)
        .then((resolved) =>
          applyViewerToSourceReference(resolved, viewerId, supabase, { isModerator })
        )
        .catch((referenceError) => {
          console.error("[source-reference] failed to resolve the card:", referenceError);
          return null;
        }),
    ]);
    if (!canSee) {
      return notFound(copy.postNotFound);
    }

    return NextResponse.json({ reference }, { headers: NO_STORE });
  } catch (error) {
    console.error("[source-reference] unexpected error:", error);
    return NextResponse.json(
      { error: copy.postsFetchFailed, errorCode: "POSTS_SOURCE_REFERENCE_FAILED" },
      { status: 500, headers: NO_STORE }
    );
  }
}
