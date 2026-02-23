/**
 * フリー素材画像管理API（更新・削除）
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  uploadMaterialImage,
  deleteMaterialImage,
} from "@/features/materials-images/lib/material-image-storage";
import type { MaterialPageImage, MaterialPageImageUpdate } from "@/features/materials-images/lib/schema";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * PATCH: 画像更新
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { slug, id } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null | undefined;
    const alt = formData.get("alt") as string | null;
    const display_order = formData.get("display_order") as string | null;

    const supabase = createAdminClient();

    const updateData: MaterialPageImageUpdate = {};

    if (alt !== null) updateData.alt = alt.trim();
    if (display_order !== null)
      updateData.display_order = parseInt(display_order, 10) || 0;

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

      const fileId = crypto.randomUUID();
      const { imageUrl, storagePath } = await uploadMaterialImage(
        file,
        slug,
        fileId
      );
      updateData.image_url = imageUrl;
      updateData.storage_path = storagePath;

      // 旧画像をStorageから削除
      const { data: existing } = await supabase
        .from("materials_images")
        .select("storage_path")
        .eq("id", id)
        .single();

      if (existing?.storage_path) {
        try {
          await deleteMaterialImage(existing.storage_path);
        } catch {
          // 旧画像削除失敗は続行
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("materials_images")
      .update(updateData)
      .eq("id", id)
      .eq("page_slug", slug)
      .select()
      .single();

    if (error) {
      console.error("[Admin Materials Images] PATCH error:", error);
      return NextResponse.json(
        { error: "画像の更新に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag(`materials-images-${slug}`, "max");
    revalidatePath("/free-materials");

    return NextResponse.json(data as MaterialPageImage);
  } catch (error) {
    console.error("[Admin Materials Images] PATCH error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "画像の更新に失敗しました",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 画像削除
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { slug, id } = await params;

  const supabase = createAdminClient();

  const { data: image, error: fetchError } = await supabase
    .from("materials_images")
    .select("storage_path")
    .eq("id", id)
    .eq("page_slug", slug)
    .single();

  if (fetchError || !image) {
    return NextResponse.json(
      { error: "画像が見つかりません" },
      { status: 404 }
    );
  }

  if (image.storage_path) {
    try {
      await deleteMaterialImage(image.storage_path);
    } catch (storageErr) {
      console.error("[Admin Materials Images] Delete storage error:", storageErr);
      // Storage削除失敗してもDB削除は続行
    }
  }

  const { error: deleteError } = await supabase
    .from("materials_images")
    .delete()
    .eq("id", id)
    .eq("page_slug", slug);

  if (deleteError) {
    console.error("[Admin Materials Images] DELETE error:", deleteError);
    return NextResponse.json(
      { error: "画像の削除に失敗しました" },
      { status: 500 }
    );
  }

  revalidateTag(`materials-images-${slug}`, "max");
  revalidatePath("/free-materials");

  return NextResponse.json({ success: true });
}
