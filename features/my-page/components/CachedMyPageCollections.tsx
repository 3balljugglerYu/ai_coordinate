import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";
import {
  MyPageCollections,
  type CompletedMountView,
} from "./MyPageCollections";

/**
 * マイページのコレクション表示(完了台紙サムネ + 進捗一覧)を保有ペルコインの
 * 直前に配置する。完了台紙はユーザー別 cache、進捗はクライアントでライブ取得。
 */
export async function CachedMyPageCollections({ userId }: { userId: string }) {
  "use cache";
  cacheTag(`collection-completions:${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("collection_completions")
    .select(
      "id, category_key, mount_image_path, completed_at, preset_categories(display_name_ja, mount_template_width, mount_template_height)",
    )
    .eq("user_id", userId)
    .eq("mount_status", "completed")
    .order("completed_at", { ascending: false });

  const completedMounts: CompletedMountView[] = (data ?? [])
    .map((row) => {
      const mountImageUrl = buildPublicGeneratedImageUrl(
        (row.mount_image_path as string | null) ?? null,
      );
      if (!mountImageUrl) return null;
      const cat = (row as { preset_categories?: unknown }).preset_categories;
      const catRecord = (Array.isArray(cat) ? cat[0] : cat) as
        | {
            display_name_ja?: string;
            mount_template_width?: number | null;
            mount_template_height?: number | null;
          }
        | undefined;
      return {
        completionId: row.id as string,
        categoryKey: row.category_key as string,
        displayName: catRecord?.display_name_ja ?? "",
        mountImageUrl,
        mountTemplateWidth: catRecord?.mount_template_width ?? null,
        mountTemplateHeight: catRecord?.mount_template_height ?? null,
      } satisfies CompletedMountView;
    })
    .filter((m): m is CompletedMountView => m !== null);

  return <MyPageCollections completedMounts={completedMounts} />;
}
