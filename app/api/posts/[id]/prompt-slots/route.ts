import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isNameInputAvailable } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";
import { describeNameInputForUsers } from "@/shared/generation/name-input";

/**
 * カタログから使う人の生成シートに出す「名前の欄」の情報を返す
 * (docs/planning/name-input-slot-plan.md 3.5)。
 *
 * ⭐ **本文は返さない。** 見出し・入力例・必須かどうかだけを返すので、非公開プロンプトでも使える
 * (本文を返す `/api/posts/[id]/prompt-text` とは別の経路にしている)。
 *
 * 認可は prompt-text と同じ `validate_derived_prompt_source`(フォロー・ブロック・原作の状態)。
 * 通らないときは理由を区別せず 404(ADR-005)。名前の欄を使えない人・欄の無いプロンプトは
 * `{ nameInput: null }`。
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
    // 名前の欄を使えない人には、目印があっても出さない(受付でも名前を捨てる)
    if (!isNameInputAvailable(user.id)) {
      return NextResponse.json({ nameInput: null });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: validation, error: validationError } = await supabase
      .rpc("validate_derived_prompt_source", {
        p_source_post_id: id,
        p_requester_id: user.id,
      })
      .select("is_available, root_post_id")
      .maybeSingle();

    if (validationError) {
      console.error("Prompt slots validation failed", { code: validationError.code });
      return jsonUnavailable(copy.promptTextUnavailable);
    }
    const validated = validation as
      | { is_available?: boolean; root_post_id?: string | null }
      | null;
    if (!validated?.is_available || !validated.root_post_id) {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    const { data: secretRow, error: secretError } = await supabase
      .from("generated_image_prompt_secrets")
      .select("prompt")
      .eq("image_id", validated.root_post_id)
      .maybeSingle();
    if (secretError || !secretRow) {
      return jsonUnavailable(copy.promptTextUnavailable);
    }

    const prompt = (secretRow as { prompt?: string | null }).prompt ?? "";
    return NextResponse.json({ nameInput: describeNameInputForUsers(prompt) });
  } catch (error) {
    console.error("Prompt slots API error:", error);
    return NextResponse.json(
      { error: copy.postsFetchFailed, errorCode: "POSTS_PROMPT_SLOTS_FAILED" },
      { status: 500 }
    );
  }
}

/** 落ちた理由を区別させない共通の応答 (ADR-005)。 */
function jsonUnavailable(message: string) {
  return NextResponse.json(
    { error: message, errorCode: "POSTS_PROMPT_SLOTS_UNAVAILABLE" },
    { status: 404 }
  );
}
