/**
 * バナー管理API（一覧・作成）
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBannerImage } from "@/features/banners/lib/banner-storage";
import type { Banner, BannerInsert } from "@/features/banners/lib/schema";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * GET: バナー一覧（全ステータス、管理用）
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("banners")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Admin Banners] GET error:", error);
    return NextResponse.json(
      { error: "バナー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json(data as Banner[]);
}

/**
 * POST: バナー新規作成
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const link_url = formData.get("link_url") as string | null;
    const alt = formData.get("alt") as string | null;
    const display_start_at = formData.get("display_start_at") as string | null;
    const display_end_at = formData.get("display_end_at") as string | null;
    const display_order = formData.get("display_order") as string | null;
    const status = formData.get("status") as string | null;
    const tagsRaw = formData.get("tags") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "画像ファイルは必須です" },
        { status: 400 }
      );
    }

    if (!link_url || link_url.trim() === "") {
      return NextResponse.json(
        { error: "遷移先URLは必須です" },
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

    const validStatus = status === "draft" || status === "published";
    const bannerStatus = validStatus ? status : "published";

    const supabase = createAdminClient();

    // IDを事前生成（アップロードのファイル名に使用）
    const bannerId = crypto.randomUUID();

    let imageUrl: string;
    let storagePath: string;

    try {
      const uploaded = await uploadBannerImage(file, bannerId);
      imageUrl = uploaded.imageUrl;
      storagePath = uploaded.storagePath;
    } catch (uploadErr) {
      console.error("[Admin Banners] Upload error:", uploadErr);
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

    const tags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const insertData: BannerInsert = {
      image_url: imageUrl,
      storage_path: storagePath,
      link_url: link_url.trim(),
      alt: alt.trim(),
      display_start_at: display_start_at?.trim() || null,
      display_end_at: display_end_at?.trim() || null,
      display_order: parseInt(display_order || "0", 10) || 0,
      status: bannerStatus as "draft" | "published",
      tags,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("banners")
      .insert({ id: bannerId, ...insertData })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[Admin Banners] Insert error:", insertError);
      try {
        const { deleteBannerImage } = await import(
          "@/features/banners/lib/banner-storage"
        );
        await deleteBannerImage(storagePath);
      } catch {
        // ロールバックのStorage削除失敗はログのみ
      }
      return NextResponse.json(
        { error: "バナーの作成に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag("banners", "max");
    revalidatePath("/");

    const { data: created } = await supabase
      .from("banners")
      .select("*")
      .eq("id", bannerId)
      .single();

    return NextResponse.json(created as Banner);
  } catch (error) {
    console.error("[Admin Banners] POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "バナーの作成に失敗しました",
      },
      { status: 500 }
    );
  }
}
