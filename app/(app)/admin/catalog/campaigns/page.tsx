import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCampaignsAdmin } from "@/features/catalog/lib/admin-repository";
import { AdminCatalogCampaignsClient } from "./AdminCatalogCampaignsClient";

export default async function AdminCatalogCampaignsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const adminClient = createAdminClient();
  const { data } = await listCampaignsAdmin(adminClient, { limit: 200 });

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
          企画 (本) の作成・編集・公開を行います。
        </p>
      </header>
      <AdminCatalogCampaignsClient initialCampaigns={data ?? []} />
    </div>
  );
}
