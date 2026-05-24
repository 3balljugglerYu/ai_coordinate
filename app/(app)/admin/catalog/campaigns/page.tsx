import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCampaignsAdmin } from "@/features/catalog/lib/admin-repository";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";
import { AdminCatalogCampaignsClient } from "./AdminCatalogCampaignsClient";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

export default async function AdminCatalogCampaignsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const adminClient = createAdminClient();
  const { data } = await listCampaignsAdmin(adminClient, { limit: 200 });
  const campaigns = data ?? [];

  // 既存カバー画像の signed URL をまとめて解決 (プレビュー用)
  const coverPaths = campaigns
    .map((c) => c.cover_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const { urls } = await createCatalogSignedUrls(
    adminClient,
    coverPaths,
    SIGNED_URL_TTL_SECONDS,
  );
  const pathToUrl = new Map<string, string | null>();
  coverPaths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const enrichedCampaigns = campaigns.map((c) => ({
    ...c,
    cover_image_url:
      c.cover_storage_path != null
        ? pathToUrl.get(c.cover_storage_path) ?? null
        : null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          絵師カタログ - 企画管理
        </h1>
        <p className="mt-1 text-slate-600">
          企画 (本) の作成・編集・公開とカバー画像のアップロードを行います。
        </p>
      </header>
      <AdminCatalogCampaignsClient initialCampaigns={enrichedCampaigns} />
    </div>
  );
}
