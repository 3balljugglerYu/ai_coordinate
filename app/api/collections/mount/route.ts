import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMountLayoutKey, slotCountForLayout } from "@/features/collections/lib/mount-layouts";
import { composeMount } from "@/features/collections/lib/compose-mount";
import { getRepresentativeImagesForCategory } from "@/features/collections/lib/representative-images";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import type { ReserveCollectionResultRow } from "@/features/collections/lib/collection-types";

// 注: 本リポジトリは Next.js 16 Cache Components 有効のため route segment config
// (export const runtime) は使用不可。API Route はデフォルトで Node ランタイムで動き、
// sharp(Node) もそのまま利用できる。

const GENERATED_IMAGES_BUCKET = "generated-images";
const TEMPLATE_BUCKET = "collection-mount-templates";
const CATEGORY_KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, errorCode: code }, { status });
}

async function downloadBuffer(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  path: string,
): Promise<Buffer> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`download failed (${bucket}/${path}): ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function POST(request: Request) {
  // 1) 認証(セッションから user を解決。client の user_id は信用しない)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("ログインが必要です", "UNAUTHENTICATED", 401);
  }

  // 2) 入力(categoryKey のみ)
  let categoryKey: unknown;
  try {
    const body = await request.json();
    categoryKey = body?.categoryKey;
  } catch {
    return jsonError("不正なリクエストです", "INVALID_BODY", 400);
  }
  if (typeof categoryKey !== "string" || !CATEGORY_KEY_PATTERN.test(categoryKey)) {
    return jsonError("不正なカテゴリです", "INVALID_CATEGORY_KEY", 400);
  }

  // 3) 予約(N到達をサーバー側で再検証。冪等)
  const { data: reserveData, error: reserveError } = await supabase.rpc(
    "reserve_collection_completion",
    { p_category_key: categoryKey },
  );
  if (reserveError) {
    // threshold_not_reached / collection_series_not_found 等はクライアント起因
    return jsonError("台紙を生成できませんでした", "RESERVE_FAILED", 400);
  }
  const reserved = (
    Array.isArray(reserveData) ? reserveData[0] : reserveData
  ) as ReserveCollectionResultRow | undefined;
  if (!reserved) {
    return jsonError("台紙を生成できませんでした", "RESERVE_EMPTY", 500);
  }

  const admin = createAdminClient();
  const completionId = reserved.completion_id;
  const mountStoragePath = `collection-mounts/${user.id}/${categoryKey}/mount.png`;
  const { data: publicUrlData } = admin.storage
    .from(GENERATED_IMAGES_BUCKET)
    .getPublicUrl(mountStoragePath);
  const mountImageUrl = publicUrlData.publicUrl;
  const sharePath = `/m/${completionId}`;

  // 既に完了済みなら再生成しない(ADR-004)
  if (reserved.mount_status === "completed") {
    return NextResponse.json({ status: "completed", mountImageUrl, sharePath });
  }

  // 4) 合成(generating)。失敗時は failed に落として 500。
  try {
    const { data: category, error: categoryError } = await admin
      .from("preset_categories")
      .select("id, mount_template_path, mount_layout, completion_threshold")
      .eq("key", categoryKey)
      .eq("is_collection_series", true)
      .single();
    if (categoryError || !category) {
      throw new Error(`category not found: ${categoryError?.message ?? categoryKey}`);
    }
    const layout = category.mount_layout as unknown;
    const templatePath = category.mount_template_path as string | null;
    if (!isMountLayoutKey(layout) || !templatePath) {
      throw new Error("collection settings incomplete (layout/template)");
    }

    const templatePng = await downloadBuffer(admin, TEMPLATE_BUCKET, templatePath);

    const reps = await getRepresentativeImagesForCategory({
      userId: user.id,
      categoryId: category.id as string,
      limit: slotCountForLayout(layout),
    });
    if (reps.length === 0) {
      throw new Error("no representative images found");
    }
    const stickers = await Promise.all(
      reps.map((r) => downloadBuffer(admin, GENERATED_IMAGES_BUCKET, r.storagePath)),
    );

    const mountPng = await composeMount({ templatePng, stickers, layout });

    const { error: uploadError } = await admin.storage
      .from(GENERATED_IMAGES_BUCKET)
      .upload(mountStoragePath, mountPng, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`mount upload failed: ${uploadError.message}`);
    }

    // 5) 完了確定。初回遷移(true)のときだけイベント記録(重複防止)
    const { data: finalized, error: finalizeError } = await supabase.rpc(
      "finalize_collection_completion",
      { p_completion_id: completionId, p_mount_image_path: mountStoragePath },
    );
    if (finalizeError) {
      throw new Error(`finalize failed: ${finalizeError.message}`);
    }
    if (finalized === true) {
      // マイページのコレクション表示(ユーザー別 cache)を更新
      revalidateTag(`collection-completions:${user.id}`, "max");
      await Promise.allSettled([
        recordStyleUsageEvent({
          userId: user.id,
          authState: "authenticated",
          eventType: "complete_achieved",
        }),
        recordStyleUsageEvent({
          userId: user.id,
          authState: "authenticated",
          eventType: "mount_generated",
        }),
      ]);
    }

    return NextResponse.json({ status: "completed", mountImageUrl, sharePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    try {
      await supabase.rpc("fail_collection_completion", {
        p_completion_id: completionId,
        p_error: message.slice(0, 500),
      });
    } catch {
      // fail 記録自体の失敗は致命ではない(本体エラーを優先して返す)
    }
    console.error("collection mount generation failed:", message);
    return jsonError("台紙の生成に失敗しました", "MOUNT_GENERATION_FAILED", 500);
  }
}
