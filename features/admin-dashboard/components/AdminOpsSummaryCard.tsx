import {
  AlertTriangle,
  BadgeDollarSign,
  Clock3,
  ReceiptText,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOpsSummary } from "../lib/dashboard-types";

interface AdminOpsSummaryCardProps {
  opsSummary: DashboardOpsSummary;
}

export function AdminOpsSummaryCard({
  opsSummary,
}: AdminOpsSummaryCardProps) {
  const items = [
    {
      label: "failed jobs",
      value: opsSummary.failedJobs.toLocaleString("ja-JP"),
      description: "レンジ内の失敗ジョブ",
      icon: AlertTriangle,
      tone: "text-amber-700 bg-amber-100",
    },
    {
      label: "average order value",
      value:
        opsSummary.averageOrderValueYen === null
          ? "-"
          : `¥${opsSummary.averageOrderValueYen.toLocaleString("ja-JP")}`,
      description: "平均購入単価",
      icon: BadgeDollarSign,
      tone: "text-violet-700 bg-violet-100",
    },
    {
      label: "purchase count",
      value: `${opsSummary.purchaseCount.toLocaleString("ja-JP")}件`,
      description: "購入件数",
      icon: ReceiptText,
      tone: "text-emerald-700 bg-emerald-100",
    },
    {
      label: "purchasing users",
      value: `${opsSummary.purchasingUsers.toLocaleString("ja-JP")}人`,
      description: "購入ユーザー数",
      icon: Users,
      tone: "text-fuchsia-700 bg-fuchsia-100",
    },
    {
      label: "expiring free percoins",
      value: `${opsSummary.expiringUsers.toLocaleString("ja-JP")}人`,
      description: `${opsSummary.expiringPercoins.toLocaleString("ja-JP")}コインが7日以内に失効`,
      icon: Clock3,
      tone: "text-blue-700 bg-blue-100",
    },
    {
      label: "balance snapshot",
      value: `有料 ${opsSummary.totalPaidBalance.toLocaleString("ja-JP")}`,
      description: `無料 ${opsSummary.totalPromoBalance.toLocaleString("ja-JP")}`,
      icon: Wallet,
      tone: "text-teal-700 bg-teal-100",
    },
  ] as const;

  return (
    <Card className="h-full border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          オペレーションサマリー
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {item.value}
                  </p>
                  <p className="text-sm text-slate-600">{item.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
