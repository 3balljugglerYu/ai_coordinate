import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  CATALOG_CACHE_TAGS,
  catalogCampaignTag,
  catalogEntryTag,
} from "@/features/catalog/lib/get-public-catalog";
import { getEntryByIdAdmin } from "@/features/catalog/lib/admin-repository";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject", "unpublish"]),
  reason: z.string().max(500).optional().nullable(),
});

const ACTION_TO_AUDIT = {
  approve: "catalog_entry_approve",
  reject: "catalog_entry_reject",
  unpublish: "catalog_entry_unpublish",
} as const;

const ACTION_TO_NOTIFICATION_TYPE = {
  approve: "catalog_entry_approved",
  reject: "catalog_entry_rejected",
  unpublish: "catalog_entry_unpublished",
} as const;

/**
 * POST /api/admin/catalog/entries/[id]/decision
 *
 * admin が承認 / 差戻し / 非公開化を 1 トランザクションで適用する。
 * - apply_catalog_entry_decision RPC で status と監査ログを atomic に更新
 * - admin_audit_log に横断検索用ログを追加
 * - 会員投稿者には notifications.insert で通知 (ゲスト投稿者には未対応、submitter_email は Phase 6 で別途実装)
 * - revalidateTag で catalog 系キャッシュを失効
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;
  if (!id) {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_ID", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      copy.decisionInvalidAction,
      "CATALOG_ADMIN_INVALID_ACTION",
      400,
    );
  }

  const { action } = parsed.data;
  const reason =
    action === "approve" ? null : parsed.data.reason?.trim() || null;
  const adminClient = createAdminClient();

  // 通知用に entry と campaign 情報を取得
  const { data: entry, error: fetchError } = await getEntryByIdAdmin(
    adminClient,
    id,
  );
  if (fetchError || !entry) {
    return jsonError(copy.entryNotFound, "CATALOG_ENTRY_NOT_FOUND", 404);
  }

  const now = new Date().toISOString();
  const { data: success, error: rpcError } = await adminClient.rpc(
    "apply_catalog_entry_decision",
    {
      p_entry_id: id,
      p_actor_id: adminUser.id,
      p_action: action,
      p_reason: reason ?? null,
      p_decided_at: now,
      p_metadata: { decided_at: now },
    },
  );

  if (rpcError) {
    console.error("[admin catalog decision] RPC failed", rpcError);
    return jsonError(
      copy.decisionFailed,
      "CATALOG_ADMIN_DECISION_FAILED",
      500,
    );
  }
  if (!success) {
    return jsonError(copy.entryNotFound, "CATALOG_ENTRY_NOT_FOUND", 404);
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: ACTION_TO_AUDIT[action],
    targetType: "catalog_entry",
    targetId: id,
    metadata: { reason: reason ?? null, campaign_id: entry.campaign_id },
  });

  // メール通知 (任意フィールド)
  if (entry.submitter_email && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    const subjectMap = {
      approve: "【Persta.AI】絵師カタログへの掲載が承認されました",
      reject: "【Persta.AI】絵師カタログへの申請について",
      unpublish: "【Persta.AI】掲載中のカタログページについて",
    } as const;
    const bodyMap = {
      approve:
        "ご申請いただいた作品が承認され、絵師カタログに掲載されました。Pelsta のカタログページからご確認いただけます。\n\nありがとうございました！",
      reject:
        `ご申請いただいた作品の審査結果は「差戻し」となりました。${reason ? `\n\n理由: ${reason}` : ""}\n\n他の作品でぜひ再申請ください。`,
      unpublish:
        `掲載中だった作品について非公開化の措置を行いました。${reason ? `\n\n理由: ${reason}` : ""}\n\nご不明点があれば運営までお問い合わせください。`,
    } as const;
    try {
      const resend = new Resend(env.RESEND_API_KEY);
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: entry.submitter_email,
        subject: subjectMap[action],
        text: bodyMap[action],
      });
    } catch (err) {
      console.warn("[admin catalog decision] resend send failed", err);
    }
  }

  // 会員投稿者にはサイト内通知。
  if (entry.submitter_user_id != null) {
    const notificationType = ACTION_TO_NOTIFICATION_TYPE[action];
    const titleMap = {
      approve: "あなたの絵がカタログに掲載されました",
      reject: "カタログへの申請が差し戻されました",
      unpublish: "公開中のカタログページが非公開になりました",
    } as const;
    const bodyMap = {
      approve: "公開カタログに反映されています。",
      reject: reason ? `理由: ${reason}` : "詳細は管理画面でご確認ください。",
      unpublish: reason
        ? `理由: ${reason}`
        : "詳細は管理画面でご確認ください。",
    } as const;

    const { error: notifyError } = await adminClient
      .from("notifications")
      .insert({
        recipient_id: entry.submitter_user_id,
        actor_id: adminUser.id,
        type: notificationType,
        entity_type: "catalog_entry",
        entity_id: id,
        title: titleMap[action],
        body: bodyMap[action],
        data: { reason: reason ?? null, action },
      });

    if (notifyError) {
      console.warn(
        "[admin catalog decision] notification insert failed (non-fatal)",
        notifyError,
      );
    }
  }

  // キャッシュ失効
  try {
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
    revalidateTag(catalogEntryTag(id), "max");
    // 親 campaign の slug を引いて per-campaign tag も失効
    const { data: campaign } = await adminClient
      .from("catalog_campaigns")
      .select("slug")
      .eq("id", entry.campaign_id)
      .maybeSingle();
    if (campaign?.slug) {
      revalidateTag(catalogCampaignTag(campaign.slug), "max");
    }
  } catch (err) {
    console.warn(
      "[admin catalog decision] revalidateTag failed (non-fatal)",
      err,
    );
  }

  return NextResponse.json({
    success: true,
    action,
    status: action === "approve" ? "approved" : "rejected",
  });
}
