import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { getCreditsSummary } from "@/features/admin-dashboard/lib/get-credits-summary";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, Wallet } from "lucide-react";

export default async function AdminCreditsSummaryPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { items, totals } = await getCreditsSummary();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          ペルコイン集計
        </h1>
        <p className="mt-1 text-slate-600">
          全ユーザーのペルコイン付与・購入・消費・残高を一覧で確認できます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Wallet className="h-5 w-5 text-violet-600" />
            全体サマリー
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">残高合計</p>
              <p className="text-xl font-bold text-slate-900">{totals.balance}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs text-emerald-700">有料残高合計</p>
              <p className="text-xl font-bold text-emerald-800">
                {totals.paid_balance}
              </p>
            </div>
            <div className="rounded-lg bg-violet-50 p-4">
              <p className="text-xs text-violet-700">無料残高合計</p>
              <p className="text-xl font-bold text-violet-800">
                {totals.promo_balance}
              </p>
            </div>
            <div className="rounded-lg bg-violet-50/70 p-4">
              <p className="text-xs text-violet-600">付与した無料合計</p>
              <p className="text-xl font-bold text-violet-800">
                {totals.promo_granted}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50/70 p-4">
              <p className="text-xs text-emerald-600">購入した有料合計</p>
              <p className="text-xl font-bold text-emerald-800">
                {totals.paid_purchased}
              </p>
            </div>
            <div className="rounded-lg bg-red-50/70 p-4">
              <p className="text-xs text-red-600">消費した無料合計</p>
              <p className="text-xl font-bold text-red-800">
                {totals.promo_consumed}
              </p>
            </div>
            <div className="rounded-lg bg-red-50/70 p-4">
              <p className="text-xs text-red-600">消費した有料合計</p>
              <p className="text-xl font-bold text-red-800">
                {totals.paid_consumed}
              </p>
            </div>
            {totals.consumption_unknown > 0 && (
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-xs text-amber-700">消費（内訳不明）</p>
                <p className="text-xl font-bold text-amber-800">
                  {totals.consumption_unknown}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="overflow-x-auto p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Coins className="h-5 w-5 text-violet-600" />
            ユーザー別一覧
            <span className="text-sm font-normal text-slate-500">
              （{items.length}ユーザー）
            </span>
          </h2>
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-3 text-left font-medium text-slate-700">
                  ユーザー
                </th>
                <th className="py-3 text-right font-medium text-slate-700">
                  残高
                </th>
                <th className="py-3 text-right font-medium text-emerald-700">
                  有料残高
                </th>
                <th className="py-3 text-right font-medium text-violet-700">
                  無料残高
                </th>
                <th className="py-3 text-right font-medium text-violet-600">
                  付与無料
                </th>
                <th className="py-3 text-right font-medium text-emerald-600">
                  購入有料
                </th>
                <th className="py-3 text-right font-medium text-red-600">
                  消費無料
                </th>
                <th className="py-3 text-right font-medium text-red-600">
                  消費有料
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.userId}
                  className="border-b border-slate-100 hover:bg-slate-50/50"
                >
                  <td className="py-3">
                    <Link
                      href={`/admin/users/${row.userId}`}
                      className="font-medium text-violet-600 hover:underline"
                    >
                      {row.nickname || row.userId.slice(0, 8) + "..."}
                    </Link>
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {row.balance}
                  </td>
                  <td className="py-3 text-right tabular-nums text-emerald-700">
                    {row.paid_balance}
                  </td>
                  <td className="py-3 text-right tabular-nums text-violet-700">
                    {row.promo_balance}
                  </td>
                  <td className="py-3 text-right tabular-nums text-violet-600">
                    {row.promo_granted}
                  </td>
                  <td className="py-3 text-right tabular-nums text-emerald-600">
                    {row.paid_purchased}
                  </td>
                  <td className="py-3 text-right tabular-nums text-red-600">
                    {row.promo_consumed}
                  </td>
                  <td className="py-3 text-right tabular-nums text-red-600">
                    {row.paid_consumed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
