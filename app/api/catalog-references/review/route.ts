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
 * - 本人でない 403・見つからない(見本の作品でない・公開停止など) 404・もう申請した 409
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
      return jsonError("この作品は審査に出せません", "CATALOG_REVIEW_FORBIDDEN", 403);
    }
    if (error.code === "P0002") {
      return jsonError("審査に出せる作品が見つかりません", "CATALOG_REVIEW_NOT_FOUND", 404);
    }
    if (error.code === "22023") {
      return jsonError("この作品はもう審査に出しています", "CATALOG_REVIEW_ALREADY_SUBMITTED", 409);
    }
    console.error("[catalog-references/review] submit error:", error.code, error.message);
    return jsonError("審査に出せませんでした", "CATALOG_REVIEW_SUBMIT_FAILED", 500);
  }

  const row = data as { status?: string; submitted_at?: string | null } | null;
  return NextResponse.json({ status: row?.status ?? "pending", submittedAt: row?.submitted_at ?? null });
}
