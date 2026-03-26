import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PopupBanner,
  PopupBannerInsert,
  PopupBannerUpdate,
} from "./schema";

export async function listPopupBanners(): Promise<PopupBanner[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("popup_banners")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as PopupBanner[];
}

export async function getPopupBannerById(
  id: string
): Promise<PopupBanner | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("popup_banners")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PopupBanner | null) ?? null;
}

export async function createPopupBanner(
  record: PopupBannerInsert
): Promise<PopupBanner> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("popup_banners")
    .insert(record)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PopupBanner;
}

export async function updatePopupBanner(
  id: string,
  patch: PopupBannerUpdate
): Promise<PopupBanner> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("popup_banners")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PopupBanner;
}

export async function deletePopupBanner(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("popup_banners").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
