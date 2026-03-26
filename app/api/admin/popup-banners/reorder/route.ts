import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listPopupBanners,
} from "@/features/popup-banners/lib/popup-banner-repository";
import { popupBannerReorderSchema } from "@/features/popup-banners/lib/schema";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  try {
    const payload = await request.json().catch(() => null);
    const parsed = popupBannerReorderSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "order は UUID 配列で指定してください" },
        { status: 400 }
      );
    }

    const currentBanners = await listPopupBanners();
    const currentIds = currentBanners.map((banner) => banner.id);
    const requestedIds = parsed.data.order;
    const requestedIdSet = new Set(requestedIds);
    const isCompleteReorder =
      requestedIds.length === currentIds.length &&
      requestedIdSet.size === requestedIds.length &&
      currentIds.every((id) => requestedIdSet.has(id));

    if (!isCompleteReorder) {
      return NextResponse.json(
        {
          error:
            "order は現在の全ポップアップバナーIDを重複なく含めてください",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const results = await Promise.all(
      requestedIds.map((id, index) =>
        supabase
          .from("popup_banners")
          .update({ display_order: index })
          .eq("id", id)
      )
    );

    const hasError = results.some((result) => result.error);
    if (hasError) {
      const firstError = results.find((result) => result.error);
      console.error("[Admin Popup Banners] reorder error:", firstError?.error);
      return NextResponse.json(
        { error: "表示順の更新に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag("popup-banners", "max");
    revalidatePath("/");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Popup Banners] reorder error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "表示順の更新に失敗しました",
      },
      { status: 500 }
    );
  }
}
