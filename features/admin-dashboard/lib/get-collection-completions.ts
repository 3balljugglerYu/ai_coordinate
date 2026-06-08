import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";

export interface CollectionCompleter {
  completionId: string;
  userId: string;
  nickname: string | null;
  completedAt: string | null;
  mountImageUrl: string | null;
}

export interface CollectionCompletersPage {
  items: CollectionCompleter[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 指定シリーズ(category_key)の達成者一覧(completed のみ)をページングで取得する。
 * admin 専用(requireAdmin 経路からのみ呼ぶ)。
 */
export async function getCollectionCompleters(params: {
  categoryKey: string;
  page: number;
  pageSize: number;
}): Promise<CollectionCompletersPage> {
  const supabase = createAdminClient();
  const page = Math.max(0, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("collection_completions")
    .select("id, user_id, completed_at, mount_image_path", { count: "exact" })
    .eq("category_key", params.categoryKey)
    .eq("mount_status", "completed")
    .order("completed_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));

  // profiles と collection_completions は直接 FK が無いため別クエリで nickname を引く
  const nicknameByUser = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      nicknameByUser.set(p.id as string, (p.nickname as string | null) ?? null);
    }
  }

  const items: CollectionCompleter[] = rows.map((r) => ({
    completionId: r.id as string,
    userId: r.user_id as string,
    nickname: nicknameByUser.get(r.user_id as string) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    mountImageUrl: buildPublicGeneratedImageUrl(
      (r.mount_image_path as string | null) ?? null,
    ),
  }));

  return { items, total: count ?? 0, page, pageSize };
}
