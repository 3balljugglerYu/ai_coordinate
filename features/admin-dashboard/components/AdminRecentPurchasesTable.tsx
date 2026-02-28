import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardPurchaseRow } from "../lib/dashboard-types";
import { cn } from "@/lib/utils";

interface AdminRecentPurchasesTableProps {
  purchases: DashboardPurchaseRow[];
}

function getModeBadgeClass(mode: string) {
  if (mode === "live") return "bg-emerald-100 text-emerald-700";
  if (mode === "test") return "bg-blue-100 text-blue-700";
  if (mode === "mock") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export function AdminRecentPurchasesTable({
  purchases,
}: AdminRecentPurchasesTableProps) {
  const emptyState = (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
      この期間に購入はありません。
    </div>
  );

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          最新購入
        </CardTitle>
      </CardHeader>
      <CardContent
        className="overflow-x-auto"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "0 320px",
        }}
      >
        {purchases.length === 0 ? (
          emptyState
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {new Date(purchase.createdAt).toLocaleString("ja-JP")}
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {purchase.packageLabel}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
                        getModeBadgeClass(purchase.mode)
                      )}
                    >
                      {purchase.mode}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">ユーザー</p>
                      {purchase.userId ? (
                        <Link
                          href={`/admin/users/${purchase.userId}`}
                          className="text-sm font-medium text-slate-900 hover:text-violet-700 hover:underline"
                        >
                          {purchase.nickname ?? purchase.userId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-slate-900">
                          不明
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">金額</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {purchase.yenValue !== null
                          ? `¥${purchase.yenValue.toLocaleString("ja-JP")}`
                          : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3">
                    <div>
                      <p className="text-xs text-slate-500">ペルコイン</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {purchase.percoins.toLocaleString("ja-JP")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">メニュー</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">
                        {purchase.packageLabel}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-3 font-medium text-slate-600">日時</th>
                    <th className="pb-3 font-medium text-slate-600">ユーザー</th>
                    <th className="pb-3 font-medium text-slate-600">パッケージ</th>
                    <th className="pb-3 text-right font-medium text-slate-600">
                      ペルコイン
                    </th>
                    <th className="pb-3 text-right font-medium text-slate-600">
                      金額
                    </th>
                    <th className="pb-3 text-right font-medium text-slate-600">
                      モード
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr
                      key={purchase.id}
                      className="border-b border-slate-100 align-top hover:bg-slate-50/60"
                    >
                      <td className="py-3 text-slate-600">
                        {new Date(purchase.createdAt).toLocaleString("ja-JP")}
                      </td>
                      <td className="py-3">
                        {purchase.userId ? (
                          <Link
                            href={`/admin/users/${purchase.userId}`}
                            className="font-medium text-slate-900 hover:text-violet-700 hover:underline"
                          >
                            {purchase.nickname ?? purchase.userId.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">不明</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-700">{purchase.packageLabel}</td>
                      <td className="py-3 text-right text-slate-700">
                        {purchase.percoins.toLocaleString("ja-JP")}
                      </td>
                      <td className="py-3 text-right text-slate-700">
                        {purchase.yenValue !== null
                          ? `¥${purchase.yenValue.toLocaleString("ja-JP")}`
                          : "-"}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
                            getModeBadgeClass(purchase.mode)
                          )}
                        >
                          {purchase.mode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
