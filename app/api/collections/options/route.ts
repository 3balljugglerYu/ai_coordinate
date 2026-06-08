import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

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

  const category = await getPresetCategoryByKey(categoryKey);
  if (
    !category ||
    !category.isCollectionSeries ||
    category.visibility !== "public" ||
    !category.isActive
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

  const { data: images, error: imageError } = await admin
    .from("generated_images")
    .select("id, image_url, generation_metadata, created_at")
    .eq("user_id", user.id)
    .eq("generation_type", "one_tap_style")
    .in("generation_metadata->oneTapStyle->>id", presetIds)
    .order("created_at", { ascending: false });
  if (imageError) {
    console.error("[collections options] image query failed:", imageError);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const byPreset = new Map<string, { id: string; url: string }[]>();
  for (const row of images ?? []) {
    const meta = row.generation_metadata as
      | { oneTapStyle?: { id?: unknown } }
      | null;
    const presetId =
      typeof meta?.oneTapStyle?.id === "string" ? meta.oneTapStyle.id : null;
    const url = row.image_url as string | null;
    if (!presetId || !displayOrderByPreset.has(presetId) || !url) continue;
    const list = byPreset.get(presetId) ?? [];
    list.push({ id: row.id as string, url });
    byPreset.set(presetId, list);
  }

  const outfits: CollectionOutfitOption[] = Array.from(byPreset.entries())
    .map(([presetId, imgs]) => ({
      presetId,
      displayOrder: displayOrderByPreset.get(presetId) ?? 0,
      images: imgs,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return NextResponse.json({ threshold: category.completionThreshold, outfits });
}
