import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * 公開プロンプトの本文を返す API。
 *
 * ## なぜ専用の経路にするか
 *
 * 公開プロンプトはフォロワーにだけ開示する値である。ところが従来は投稿詳細の
 * props に本文が載っており、未フォロワーのブラウザにも届いたうえで表示だけを
 * 伏字にしていた。devtools を開けば読めるため、フォローゲートが実質的に
 * 見た目だけのものになっていた。
 *
 * 参照カードのコピーとボトムシートの表示では本文が要るので、ここで
 * サーバー側の認可を通した経路に寄せる。あわせて投稿詳細の props からは
 * `/free` の本文を落とすため、未フォロワーには本文が一切届かなくなる。
 *
 * ## 返さない条件
 *
 * - 未ログイン
 * - `validate_derived_prompt_source` が false（削除・投稿取消・公開停止・
 *   free でない・root でない・secret 無し・原作者が利用不可・未フォロー・
 *   双方向いずれかのブロック）
 * - **原作が非公開プロンプト**
 *
 * 非公開を弾くのがこの経路の要点である。`resolve_derived_prompt_source` は
 * 本文を返す唯一の RPC で、Worker が provider 送信直前に使うためのもの。
 * ここから非公開の本文が出ると、機能そのものが成立しなくなる。
 *
 * 理由は返さない。どの条件で落ちても同じ 404 にする。区別できると原作の
 * 状態を推測できてしまう（ADR-005）。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 認可と root の解決を一度に行う。派生 ID を渡されても root へ解決される。
    const { data: validation, error: validationError } = await supabase
      .rpc("validate_derived_prompt_source", {
        p_source_post_id: id,
        p_requester_id: user.id,
      })
      .select("is_available, root_post_id")
      .maybeSingle();

    if (validationError) {
      // 検証できないときは通さない (fail closed)
      console.error("Prompt text validation failed", {
        code: validationError.code,
      });
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    const validated = validation as
      | { is_available?: boolean; root_post_id?: string | null }
      | null;

    if (!validated?.is_available || !validated.root_post_id) {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    // 非公開の本文はこの経路から絶対に出さない。
    // validate は公開・非公開のどちらも通すため、ここで明示的に絞る。
    const { data: originRow, error: originError } = await supabase
      .from("generated_images")
      .select("prompt_visibility")
      .eq("id", validated.root_post_id)
      .maybeSingle();

    if (originError || !originRow) {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    if ((originRow as { prompt_visibility?: string }).prompt_visibility !== "public") {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    // 本文の正本は author secret。generated_images.prompt は常に空である。
    const { data: secretRow, error: secretError } = await supabase
      .from("generated_image_prompt_secrets")
      .select("prompt")
      .eq("image_id", validated.root_post_id)
      .maybeSingle();

    if (secretError || !secretRow) {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    const promptText = (secretRow as { prompt: string }).prompt ?? "";
    if (!promptText) {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    return NextResponse.json({
      postId: validated.root_post_id,
      prompt: promptText,
    });
  } catch (error) {
    console.error("Prompt text API error:", error);
    return NextResponse.json(
      { error: copy.postsFetchFailed, errorCode: "POSTS_PROMPT_TEXT_FAILED" },
      { status: 500 }
    );
  }
}

/** 落ちた理由を区別させない共通の応答 (ADR-005)。 */
function jsonUnavailable(message: string) {
  return NextResponse.json(
    { error: message, errorCode: "POSTS_PROMPT_TEXT_UNAVAILABLE" },
    { status: 404 }
  );
}
