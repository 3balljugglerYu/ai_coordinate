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
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
