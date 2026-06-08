import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds } from "@/lib/env";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
// 衣装ごとに返す画像の上限(選択UI用。最新からこの件数まで)
const MAX_IMAGES_PER_OUTFIT = 12;

export interface CollectionOutfitOption {
  presetId: string;
  displayOrder: number;
  images: { id: string; url: string }[];
}

/**
 * GET /api/collections/options?categoryKey=...
 * 台紙に載せる画像を衣装ごとに選ぶための選択肢(本人の生成画像)を返す。
 * 各衣装は新しい順。画像のある衣装のみ、display_order 昇順で返す。
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const categoryKey = request.nextUrl.searchParams.get("categoryKey") ?? "";
  if (!KEY_PATTERN.test(categoryKey)) {
    return NextResponse.json({ error: "INVALID_CATEGORY_KEY" }, { status: 400 });
  }

  const isAdmin = getAdminUserIds().includes(user.id);
  const category = await getPresetCategoryByKey(categoryKey);
  if (
    !category ||
    !category.isCollectionSeries ||
    !category.isActive ||
    (category.visibility !== "public" && !isAdmin)
  ) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: presets, error: presetError } = await admin
    .from("style_presets")
    .select("id, display_order")
    .eq("category_id", category.id);
  if (presetError) {
    console.error("[collections options] preset query failed:", presetError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  const displayOrderByPreset = new Map<string, number>();
  for (const p of presets ?? []) {
    displayOrderByPreset.set(p.id as string, (p.display_order as number) ?? 0);
  }
  const presetIds = Array.from(displayOrderByPreset.keys());
  if (presetIds.length === 0) {
    return NextResponse.json({ threshold: category.completionThreshold, outfits: [] });
  }

  // 衣装ごとに「最新 MAX_IMAGES_PER_OUTFIT 件」だけ返す(レスポンス肥大・遅延を防ぐ)。
  // 衣装数(=preset数)は小さい(3/4/6 程度)ため、衣装ごとに limit 付きで個別取得する。
  try {
    const perOutfit = await Promise.all(
      presetIds.map(async (presetId) => {
        const { data, error } = await admin
          .from("generated_images")
          .select("id, image_url")
          .eq("user_id", user.id)
          .eq("generation_type", "one_tap_style")
          .eq("generation_metadata->oneTapStyle->>id", presetId)
          .order("created_at", { ascending: false })
          .limit(MAX_IMAGES_PER_OUTFIT);
        if (error) throw error;
        const images = (data ?? [])
          .filter((r) => typeof r.image_url === "string" && r.image_url)
          .map((r) => ({ id: r.id as string, url: r.image_url as string }));
        return {
          presetId,
          displayOrder: displayOrderByPreset.get(presetId) ?? 0,
          images,
        } satisfies CollectionOutfitOption;
      }),
    );

    const outfits: CollectionOutfitOption[] = perOutfit
      .filter((o) => o.images.length > 0)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return NextResponse.json({ threshold: category.completionThreshold, outfits });
  } catch (error) {
    console.error("[collections options] image query failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
