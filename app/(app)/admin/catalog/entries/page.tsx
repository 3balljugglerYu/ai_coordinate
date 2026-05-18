import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listCampaignsAdmin,
  listEntriesAdmin,
  type AdminCatalogEntryRow,
} from "@/features/catalog/lib/admin-repository";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";
import { AdminCatalogEntriesClient } from "./AdminCatalogEntriesClient";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

export default async function AdminCatalogEntriesPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const adminClient = createAdminClient();

  const [pending, approved, rejected, campaignsResult] = await Promise.all([
    listEntriesAdmin(adminClient, { status: "pending", limit: 100 }),
    listEntriesAdmin(adminClient, { status: "approved", limit: 100 }),
    listEntriesAdmin(adminClient, { status: "rejected", limit: 100 }),
    listCampaignsAdmin(adminClient, { limit: 200 }),
  ]);

  const allRows: AdminCatalogEntryRow[] = [
    ...(pending.data ?? []),
    ...(approved.data ?? []),
    ...(rejected.data ?? []),
  ];
  const paths = Array.from(new Set(allRows.map((r) => r.image_storage_path)));
  const { urls } = await createCatalogSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS,
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const enrich = (rows: AdminCatalogEntryRow[]) =>
    rows.map((row) => ({
      ...row,
      image_url: pathToUrl.get(row.image_storage_path) ?? null,
    }));

  const campaignsById = new Map<string, { slug: string; title: string }>();
  for (const c of campaignsResult.data ?? []) {
    campaignsById.set(c.id, { slug: c.slug, title: c.title });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          絵師カタログ - 申請審査
        </h1>
        <p className="mt-1 text-slate-600">
          ユーザーから申請された投稿を審査・公開します。承認時は X ツイートを開いて本人確認してください。
        </p>
      </header>

      <AdminCatalogEntriesClient
        initialPending={enrich(pending.data ?? [])}
        initialApproved={enrich(approved.data ?? [])}
        initialRejected={enrich(rejected.data ?? [])}
        campaignsById={Object.fromEntries(campaignsById)}
      />
    </div>
  );
}
