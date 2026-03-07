import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { PrReviewClient } from "./PrReviewClient";

export default async function AdminPrReviewPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
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
          GitHub PRレビュー
        </h1>
        <p className="mt-1 text-slate-600">
          PR差分をレビューし、指摘ごとにCursorへ送るボタンを表示します。
        </p>
      </header>

      <PrReviewClient />
    </div>
  );
}
