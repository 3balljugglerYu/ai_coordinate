import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10),
    MAX_LIMIT
  );
  const offset = Math.max(
    parseInt(searchParams.get("offset") || "0", 10),
    0
  );
  const actionType = searchParams.get("action_type")?.trim() || undefined;
  const targetType = searchParams.get("target_type")?.trim() || undefined;
  const dateFrom = searchParams.get("date_from")?.trim() || undefined;
  const dateTo = searchParams.get("date_to")?.trim() || undefined;
  const format = searchParams.get("format") || "json";

  const supabase = createAdminClient();

  const isCsv = format === "csv";
  const fetchLimit = isCsv ? 10000 : limit;
  const fetchOffset = isCsv ? 0 : offset;

  let query = supabase
    .from("admin_audit_log")
    .select("id, admin_user_id, action_type, target_type, target_id, metadata, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (actionType) query = query.eq("action_type", actionType);
  if (targetType) query = query.eq("target_type", targetType);
  if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const { data: logs, error, count } = await query.range(
    fetchOffset,
    fetchOffset + fetchLimit - 1
  );

  if (error) {
    console.error("Audit log fetch error:", error);
    return NextResponse.json(
      { error: "操作ログの取得に失敗しました" },
      { status: 500 }
    );
  }

  const adminIds = Array.from(
    new Set(
      (logs || [])
        .map((l) => l.admin_user_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  let profileMap: Record<string, { nickname: string | null }> = {};
  if (adminIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", adminIds);
    profileMap = (profiles || []).reduce((acc, p) => {
      acc[p.user_id] = { nickname: p.nickname ?? null };
      return acc;
    }, {} as typeof profileMap);
  }

  const enrichedLogs = (logs || []).map((log) => {
    const adminNickname = log.admin_user_id
      ? profileMap[log.admin_user_id]?.nickname ?? null
      : null;
    return { ...log, admin_nickname: adminNickname };
  });

  if (format === "csv") {
    const ACTION_LABELS: Record<string, string> = {
      user_suspend: "ユーザー停止",
      user_reactivate: "ユーザー復帰",
      bonus_grant: "ボーナス付与",
      moderation_approve: "審査: 問題なし",
      moderation_reject: "審査: 不適切",
    };
    const header = [
      "日時",
      "アクション",
      "対象タイプ",
      "対象ID",
      "管理者ID",
      "管理者ニックネーム",
      "メタデータ",
    ];
    const rows = enrichedLogs.map((log) => [
      new Date(log.created_at).toISOString(),
      ACTION_LABELS[log.action_type] || log.action_type,
      log.target_type,
      log.target_id ?? "",
      log.admin_user_id ?? "",
      log.admin_nickname ?? "",
      log.metadata ? JSON.stringify(log.metadata) : "",
    ]);
    const escapeCsv = (v: string) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const csv =
      header.map(escapeCsv).join(",") +
      "\n" +
      rows.map((r) => r.map((c) => escapeCsv(String(c))).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="admin-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    logs: enrichedLogs,
    total: count ?? 0,
    limit,
    offset,
  });
}
