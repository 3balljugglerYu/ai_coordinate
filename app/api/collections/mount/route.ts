import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { getAdminUserIds } from "@/lib/env";
import { isMountLayoutKey, slotCountForLayout } from "@/features/collections/lib/mount-layouts";
import { composeMount } from "@/features/collections/lib/compose-mount";
import { getRepresentativeImagesForCategory } from "@/features/collections/lib/representative-images";
import { resolveSelectedImages } from "@/features/collections/lib/resolve-selected-images";
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

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  // 1) 認証(セッションから user を解決。client の user_id は信用しない)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("ログインが必要です", "UNAUTHENTICATED", 401);
  }

  // 2) 入力(categoryKey + 任意 selections)
  let categoryKey: unknown;
  let selectionsRaw: unknown;
  try {
    const body = await request.json();
    categoryKey = body?.categoryKey;
    selectionsRaw = body?.selections;
  } catch {
    return jsonError("不正なリクエストです", "INVALID_BODY", 400);
  }
  if (typeof categoryKey !== "string" || !CATEGORY_KEY_PATTERN.test(categoryKey)) {
    return jsonError("不正なカテゴリです", "INVALID_CATEGORY_KEY", 400);
  }
  // selections は { [presetId]: generatedImageId } の plain object のみ許容
  let selections: Record<string, string> | null = null;
  if (selectionsRaw !== undefined && selectionsRaw !== null) {
    if (
      typeof selectionsRaw !== "object" ||
      Array.isArray(selectionsRaw) ||
      !Object.entries(selectionsRaw as Record<string, unknown>).every(
        ([k, v]) => typeof k === "string" && typeof v === "string",
      )
    ) {
      return jsonError("不正な選択です", "INVALID_SELECTIONS", 400);
    }
    selections = selectionsRaw as Record<string, string>;
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

  // 既に完了済みの台紙に対する「選択を変えて作り直す(=更新)」リクエストは許可する。
  // 競合(generating 進行中 / failed リトライ未準備)は従来通りハンドル。
  const isUpdate = reserved.mount_status === "completed";
  if (!isUpdate) {
    if (reserved.mount_status === "generating" && reserved.newly_reserved === false) {
      return NextResponse.json(
        { status: "generating", sharePath },
        { status: 202 },
      );
    }
    if (reserved.mount_status === "failed" && reserved.newly_reserved === false) {
      return jsonError("台紙生成の再試行準備ができていません", "MOUNT_RETRY_NOT_READY", 409);
    }
  }

  // 4) 合成(generating)。失敗時は failed に落として 500。
  let uploadedPath: string | null = null;
  try {
    const { data: category, error: categoryError } = await admin
      .from("preset_categories")
      .select("id, mount_template_path, mount_layout, completion_threshold, visibility")
      .eq("key", categoryKey)
      .eq("is_collection_series", true)
      .eq("is_active", true)
      .single();
    if (categoryError || !category) {
      throw new Error(`category not found: ${categoryError?.message ?? categoryKey}`);
    }
    // 公開シリーズ、または admin プレビューのみ許可(admin_only は admin だけ)
    const isAdmin = getAdminUserIds().includes(user.id);
    if (category.visibility !== "public" && !isAdmin) {
      throw new Error(`category not public: ${categoryKey}`);
    }
    const layout = category.mount_layout as unknown;
    const templatePath = category.mount_template_path as string | null;
    const threshold =
      typeof category.completion_threshold === "number"
        ? category.completion_threshold
        : null;
    if (!isMountLayoutKey(layout) || !templatePath) {
      throw new Error("collection settings incomplete (layout/template)");
    }
    const slotCount = slotCountForLayout(layout);
    if (threshold !== slotCount) {
      throw new Error(`collection threshold/layout mismatch: ${threshold ?? "null"} vs ${slotCount}`);
    }

    const templatePng = await downloadBuffer(admin, TEMPLATE_BUCKET, templatePath);

    // selections 指定があれば「ユーザーが選んだ画像」を、無ければ衣装ごと最新を採用
    const reps = selections
      ? await resolveSelectedImages({
          userId: user.id,
          categoryId: category.id as string,
          selections,
          slotCount,
        })
      : await getRepresentativeImagesForCategory({
          userId: user.id,
          categoryId: category.id as string,
          limit: slotCount,
        });
    if (reps.length !== slotCount) {
      throw new Error(`representative images incomplete: ${reps.length} of ${slotCount}`);
    }
    const stickers = await Promise.all(
      reps.map((r) => downloadBuffer(admin, GENERATED_IMAGES_BUCKET, r.storagePath)),
    );

    const mountPng = await composeMount({ templatePng, stickers, layout });

    await admin.storage.from(GENERATED_IMAGES_BUCKET).remove([mountStoragePath]);
    const { error: uploadError } = await admin.storage
      .from(GENERATED_IMAGES_BUCKET)
      .upload(mountStoragePath, mountPng, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`mount upload failed: ${uploadError.message}`);
    }
    uploadedPath = mountStoragePath;

    if (!isUpdate) {
      // 5) 初回のみ finalize(generating → completed の遷移)。イベント記録もここだけ。
      const { data: finalized, error: finalizeError } = await admin.rpc(
        "finalize_collection_completion",
        {
          p_completion_id: completionId,
          p_user_id: user.id,
          p_mount_image_path: mountStoragePath,
        },
      );
      if (finalizeError) {
        throw new Error(`finalize failed: ${finalizeError.message}`);
      }
      if (finalized !== true) {
        throw new Error("finalize skipped: completion is not generating");
      }
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
    } else {
      // 更新時は finalize 不要(既に completed)。サムネを差し替えるため cache だけ revalidate。
      revalidateTag(`collection-completions:${user.id}`, "max");
    }

    // クライアント側で古い画像がキャッシュされ続けないよう、リクエストごとに変わる
    // バージョン文字列を付与する(同一URLにファイル差し替えのため必須)。
    const versioned = `${mountImageUrl}?v=${Date.now()}`;
    return NextResponse.json({
      status: "completed",
      mountImageUrl: versioned,
      sharePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (uploadedPath) {
      await admin.storage.from(GENERATED_IMAGES_BUCKET).remove([uploadedPath]).catch(() => {});
    }
    try {
      await admin.rpc("fail_collection_completion", {
        p_completion_id: completionId,
        p_user_id: user.id,
        p_error: message.slice(0, 500),
      });
    } catch {
      // fail 記録自体の失敗は致命ではない(本体エラーを優先して返す)
    }
    console.error("collection mount generation failed:", message);
    return jsonError("台紙の生成に失敗しました", "MOUNT_GENERATION_FAILED", 500);
  }
}
