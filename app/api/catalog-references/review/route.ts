import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { jsonError } from "@/lib/api/json-error";

const bodySchema = z.object({ imageId: z.string().uuid() });

/**
 * POST /api/catalog-references/review: 見本(参照画像)つきの作品を、運営の審査に出す({ imageId })。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 4・REQ-006・ADR-005)
 *
 * - 作者が選んで押す(完成のたびには回さない)
 * - 本人の作品で「未申請」のときだけ「審査中」にする。決まりは DB の RPC submit_catalog_review が持つ
 *   (本人のログインの権限で呼ぶ。RPC が auth.uid() で本人かを確かめる)
 * - 見つからない(他人の作品・見本の作品でない・公開停止など) 404
 * - 「未申請」でない(22023)ときは、本人の審査の行を読んで分ける: 審査中 409 ALREADY_SUBMITTED・
 *   承認済み 409 ALREADY_APPROVED・作り直し 409 REJECTED(同じ作品は出し直せない。作り直して新しく申請する)
 * - 見本がほかの作品の審査で作り直しになっていれば 409 REFERENCE_REJECTED(承認されても、その見本はもう使えない)
 * - RPC にログインの情報が届かなかった(42501・auth.uid() が NULL)ときは 401(ログインし直す)
 */
export async function POST(request: NextRequest) {
  const originReject = ensureSameOrigin(request);
  if (originReject) return originReject;

  const user = await getUser();
  if (!user) {
    return jsonError("ログインが必要です", "CATALOG_REVIEW_AUTH_REQUIRED", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("入力が不正です", "CATALOG_REVIEW_INVALID_REQUEST", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("入力が不正です", "CATALOG_REVIEW_INVALID_REQUEST", 400);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("submit_catalog_review", { p_image_id: parsed.data.imageId })
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      // auth.uid() が NULL(ログインの情報が届かない)。実行の権限が外れたときも同じコードなので記録する
      console.warn("[catalog-references/review] submit refused with 42501");
      return jsonError("ログインし直してください", "CATALOG_REVIEW_AUTH_REQUIRED", 401);
    }
    if (error.code === "P0002") {
      return jsonError("審査に出せる作品が見つかりません", "CATALOG_REVIEW_NOT_FOUND", 404);
    }
    // 22023 のうち、見本が止まっているときだけは文で見分ける(状態を読み直しても「未申請」のため)
    if ((error.message ?? "").includes("CATALOG_REVIEW_REFERENCE_REJECTED")) {
      return jsonError(
        "この見本は作り直しになったため、審査に出せません。見本を変えて作り直してください",
        "CATALOG_REVIEW_REFERENCE_REJECTED",
        409,
      );
    }
    if (error.code === "22023") {
      return await alreadyDecidedResponse(supabase, parsed.data.imageId);
    }
    console.error("[catalog-references/review] submit error:", error.code, error.message);
    return jsonError("審査に出せませんでした", "CATALOG_REVIEW_SUBMIT_FAILED", 500);
  }

  const row = data as { status?: string; submitted_at?: string | null } | null;
  return NextResponse.json({ status: row?.status ?? "pending", submittedAt: row?.submitted_at ?? null });
}

/** 「未申請」でなかったとき、本人の審査の行の状態で応答を分ける(本人は自分の行を読める) */
async function alreadyDecidedResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imageId: string,
) {
  const { data, error } = await supabase
    .from("generated_image_catalog_reviews")
    .select("status")
    .eq("image_id", imageId)
    .maybeSingle();
  if (error) {
    // 読めないまま「審査中」と返すと、作り直しの案内が出なくなるので失敗にする
    console.error("[catalog-references/review] status read error:", error.code, error.message);
    return jsonError("審査に出せませんでした", "CATALOG_REVIEW_SUBMIT_FAILED", 500);
  }
  const status = (data as { status?: string } | null)?.status;
  if (status === "approved") {
    // 承認のあとに公開停止された作品もここに来るので、「投稿できます」とは言わない
    return jsonError("この作品はもう承認されています", "CATALOG_REVIEW_ALREADY_APPROVED", 409);
  }
  if (status === "rejected") {
    return jsonError(
      "作り直しになった作品は出し直せません。見本を変えて作り直してください",
      "CATALOG_REVIEW_REJECTED",
      409,
    );
  }
  return jsonError("この作品はもう審査に出しています", "CATALOG_REVIEW_ALREADY_SUBMITTED", 409);
}
