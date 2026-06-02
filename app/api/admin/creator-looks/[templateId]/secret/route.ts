/**
 * GET /api/admin/creator-looks/[templateId]/secret
 *
 * admin が Creator Looks 投稿の hidden_prompt を確認するための API。
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-001, ADR-008
 *   - service_role + SECURITY DEFINER 関数経由でのみアクセス可能 (= 通常 user は RLS で完全遮断)
 *   - 関数内部で admin_users 所属を必ず確認 (ADR-008)
 *   - レスポンスには hidden_prompt のみ含める (= redactSecrets を通さず生で返す、admin 信頼境界扱い)
 *   - クライアントの devtools 経由で hidden_prompt が見える = admin が漏らした場合の責任は運営契約に帰属
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const patchBodySchema = z.object({
  hidden_prompt: z.string().min(10).max(20000),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  // requireAdmin は throw NextResponse(403/401) で reject (= 既存パターン)
  try {
    await requireAdmin();
  } catch (rejection) {
    if (rejection instanceof NextResponse) return rejection;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId } = await params;
  if (!templateId || !UUID_RE.test(templateId)) {
    return NextResponse.json(
      { error: "invalid_template_id" },
      { status: 400 },
    );
  }

  // 認証済みユーザーの Cookie/JWT を持つ server client を使う。
  // get_creator_looks_secret_for_admin RPC は内部で auth.uid() を読んで
  // admin_users 所属を確認するため、service-role の createAdminClient() では
  // auth.uid() が NULL になり常に 403 (not_authorized) が返ってしまう。
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_creator_looks_secret_for_admin",
    { p_template_id: templateId },
  );

  if (error) {
    // RPC が `not_authorized` を throw した場合 (= admin role 確認失敗) は 403
    const message = error.message ?? "";
    if (message.includes("not_authorized")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(
      "[admin/creator-looks/secret] RPC failed for template",
      templateId,
      error,
    );
    return NextResponse.json({ error: "rpc_failed" }, { status: 500 });
  }

  if (data === null || data === undefined) {
    return NextResponse.json(
      { hidden_prompt: null, status: "not_ready" },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { hidden_prompt: data, status: "ready" },
    { status: 200 },
  );
}

/**
 * PATCH /api/admin/creator-looks/[templateId]/secret
 *
 * admin が hidden_prompt を手動で編集する。
 * UPDATE 後に user_style_template_secrets AFTER UPDATE Trigger
 * (= 20260603100400 で追加) が発火し、admin preview が自動再生成される。
 *
 * 設計判断:
 *   - requireAdmin() で API レイヤーの admin チェック (= 既存パターン)
 *   - service-role の adminClient で直接 UPSERT (= RPC を追加せず最小修正)
 *   - audit log として style_template_audit_logs に「hidden_prompt 手動更新」を記録
 *     (= 監査性、誰がいつ編集したかを追跡可能に)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  let actorId: string | null = null;
  try {
    const user = await requireAdmin();
    actorId = user.id;
  } catch (rejection) {
    if (rejection instanceof NextResponse) return rejection;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId } = await params;
  if (!templateId || !UUID_RE.test(templateId)) {
    return NextResponse.json(
      { error: "invalid_template_id" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_hidden_prompt" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // 対象テンプレが Creator Looks 投稿であることを確認
  const { data: template, error: tmplErr } = await adminClient
    .from("user_style_templates")
    .select("id, is_creator_looks")
    .eq("id", templateId)
    .maybeSingle();
  if (tmplErr) {
    console.error("[admin/creator-looks/secret PATCH] template fetch", tmplErr);
    return NextResponse.json({ error: "template_fetch_failed" }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "template_not_found" }, { status: 404 });
  }
  if (template.is_creator_looks !== true) {
    return NextResponse.json({ error: "not_creator_looks" }, { status: 400 });
  }

  // 既存 row の hidden_prompt のみを UPDATE。
  // (= upsert + updated_at は user_style_template_secrets に updated_at カラムが
  // 存在しないため PGRST204 になる。抽出済 row があることが前提なので UPDATE で十分)
  // user_style_template_secrets AFTER UPDATE trigger が hidden_prompt 変更時に
  // admin preview 再生成を enqueue する (= 20260603100400)。
  const { error: updateError, count: updatedCount } = await adminClient
    .from("user_style_template_secrets")
    .update(
      { hidden_prompt: parsed.data.hidden_prompt },
      { count: "exact" },
    )
    .eq("template_id", templateId);
  if (updateError) {
    console.error(
      "[admin/creator-looks/secret PATCH] update failed",
      updateError,
    );
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!updatedCount || updatedCount === 0) {
    // 抽出前の状態 (= secrets 行が無い) で編集しようとした
    return NextResponse.json(
      { error: "hidden_prompt_not_ready" },
      { status: 404 },
    );
  }

  // 監査ログ (= hidden_prompt の値は metadata に絶対含めない、ADR-009)
  await adminClient.from("style_template_audit_logs").insert({
    template_id: templateId,
    actor_id: actorId,
    action: "edit",
    reason: "admin_hidden_prompt_edit",
    metadata: {
      event: "creator_looks_hidden_prompt_manual_edit",
      hidden_prompt_length: parsed.data.hidden_prompt.length,
    },
  });

  return NextResponse.json({ success: true, status: "ready" }, { status: 200 });
}
