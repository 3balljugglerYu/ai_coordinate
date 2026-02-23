/**
 * フリー素材画像管理API（一覧・作成）
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMaterialImage } from "@/features/materials-images/lib/material-image-storage";
import type { MaterialPageImage, MaterialPageImageInsert } from "@/features/materials-images/lib/schema";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * GET: 指定slugの画像一覧（管理用）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { slug } = await params;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("materials_images")
    .select("*")
    .eq("page_slug", slug)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Admin Materials Images] GET error:", error);
    return NextResponse.json(
      { error: "画像一覧の取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json(data as MaterialPageImage[]);
}

/**
 * POST: 画像新規作成
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { slug } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const alt = formData.get("alt") as string | null;
    const display_order = formData.get("display_order") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "画像ファイルは必須です" },
        { status: 400 }
      );
    }

    if (!alt || alt.trim() === "") {
      return NextResponse.json(
        { error: "altテキストは必須です" },
        { status: 400 }
      );
    }

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

    const supabase = createAdminClient();

    const fileId = crypto.randomUUID();

    let imageUrl: string;
    let storagePath: string;

    try {
      const uploaded = await uploadMaterialImage(file, slug, fileId);
      imageUrl = uploaded.imageUrl;
      storagePath = uploaded.storagePath;
    } catch (uploadErr) {
      console.error("[Admin Materials Images] Upload error:", uploadErr);
      return NextResponse.json(
        {
          error:
            uploadErr instanceof Error
              ? uploadErr.message
              : "画像のアップロードに失敗しました",
        },
        { status: 500 }
      );
    }

    const insertData: MaterialPageImageInsert = {
      page_slug: slug,
      image_url: imageUrl,
      storage_path: storagePath,
      alt: alt.trim(),
      display_order: parseInt(display_order || "0", 10) || 0,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("materials_images")
      .insert(insertData)
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("[Admin Materials Images] Insert error:", insertError);
      try {
        const { deleteMaterialImage } = await import(
          "@/features/materials-images/lib/material-image-storage"
        );
        await deleteMaterialImage(storagePath);
      } catch {
        // ロールバックのStorage削除失敗はログのみ
      }
      return NextResponse.json(
        { error: "画像の作成に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag(`materials-images-${slug}`, "max");
    revalidatePath("/free-materials");

    return NextResponse.json(inserted as MaterialPageImage);
  } catch (error) {
    console.error("[Admin Materials Images] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "画像の作成に失敗しました",
      },
      { status: 500 }
    );
  }
}
