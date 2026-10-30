import { connection } from "next/server";
import { ensureAdminPage } from "@/lib/admin-page-guard";
import { listPendingCatalogReviews } from "@/features/catalog-references/lib/review-admin-repository";
import { CatalogReviewsClient } from "./CatalogReviewsClient";

/**
 * 見本(参照画像)つきの作品の審査。見本・元の画像・できた画像・まねたもの・プロンプトを並べて、
 * 承認か作り直しを決める。審査の目安は2日以内(2026-10-30 ユーザー決定)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 4)
 */
export default async function AdminCatalogReviewsPage() {
  await connection();
  await ensureAdminPage();

  const items = await listPendingCatalogReviews();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-admin-heading), ui-monospace, monospace" }}
        >
          見本の審査
        </h1>
        <p className="mt-1 text-slate-600">
          見本(参照画像)を使った作品の審査です。承認すると作者に通知が届き、作者が投稿できるようになります。
          作り直しにすると、理由と一緒に通知が届きます(同じ作品は出し直せません)。審査の目安は2日以内です。
        </p>
      </header>
      <CatalogReviewsClient initialItems={items} />
    </div>
  );
}
