/**
 * バナー管理API（更新・削除）
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  uploadBannerImage,
  deleteBannerImage,
} from "@/features/banners/lib/banner-storage";
import type { Banner, BannerUpdate } from "@/features/banners/lib/schema";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * PATCH: バナー更新
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null | undefined;
    const link_url = formData.get("link_url") as string | null;
    const alt = formData.get("alt") as string | null;
    const display_start_at = formData.get("display_start_at") as string | null;
    const display_end_at = formData.get("display_end_at") as string | null;
    const display_order = formData.get("display_order") as string | null;
    const status = formData.get("status") as string | null;
    const tagsRaw = formData.get("tags") as string | null;

    const supabase = createAdminClient();

    const updateData: BannerUpdate = {};

    if (link_url !== null) updateData.link_url = link_url.trim();
    if (alt !== null) updateData.alt = alt.trim();
    if (display_start_at !== null)
      updateData.display_start_at = display_start_at.trim() || null;
    if (display_end_at !== null)
      updateData.display_end_at = display_end_at.trim() || null;
    if (display_order !== null)
      updateData.display_order = parseInt(display_order, 10) || 0;
    if (status === "draft" || status === "published")
      updateData.status = status;
    if (tagsRaw !== null) {
      updateData.tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (file && file.size > 0) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          {
            error: `許可されていないファイル形式です。対応: ${ALLOWED_MIME_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "ファイルサイズは5MB以下にしてください" },
          { status: 400 }
        );
      }

      const { imageUrl, storagePath } = await uploadBannerImage(file, id);
      updateData.image_url = imageUrl;
      updateData.storage_path = storagePath;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("banners")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[Admin Banners] PATCH error:", error);
      return NextResponse.json(
        { error: "バナーの更新に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag("banners", "max");
    revalidatePath("/");

    return NextResponse.json(data as Banner);
  } catch (error) {
    console.error("[Admin Banners] PATCH error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "バナーの更新に失敗しました",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: バナー削除
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;

  const supabase = createAdminClient();

  const { data: banner, error: fetchError } = await supabase
    .from("banners")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (fetchError || !banner) {
    return NextResponse.json(
      { error: "バナーが見つかりません" },
      { status: 404 }
    );
  }

  if (banner.storage_path) {
    try {
      await deleteBannerImage(banner.storage_path);
    } catch (storageErr) {
      console.error("[Admin Banners] Delete storage error:", storageErr);
      // Storage削除失敗してもDB削除は続行
    }
  }

  const { error: deleteError } = await supabase
    .from("banners")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[Admin Banners] DELETE error:", deleteError);
    return NextResponse.json(
      { error: "バナーの削除に失敗しました" },
      { status: 500 }
    );
  }

  revalidateTag("banners", "max");
  revalidatePath("/");

  return NextResponse.json({ success: true });
}
