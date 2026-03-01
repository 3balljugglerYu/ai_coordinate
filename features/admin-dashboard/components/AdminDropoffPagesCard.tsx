import { TrendingDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ga4DropoffPageRow } from "@/features/analytics/lib/ga4-types";

interface AdminDropoffPagesCardProps {
  rows: Ga4DropoffPageRow[];
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function AdminDropoffPagesCard({
  rows,
}: AdminDropoffPagesCardProps) {
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          導線離脱が多いページ
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          売上導線の中で止まりやすいページを見つけ、次ページへの遷移改善が必要な箇所を把握します。
        </CardDescription>
      </CardHeader>
      <CardContent
        className="space-y-3"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "0 340px",
        }}
      >
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
            まだ十分な導線データはありません。
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <div
                  key={row.page}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-slate-900">
                        {row.page}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <TrendingDown className="h-5 w-5" aria-hidden />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3">
                    <div>
                      <p className="text-xs text-slate-500">到達</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {row.reachedSessions.toLocaleString("ja-JP")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">継続</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {row.continuedSessions.toLocaleString("ja-JP")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">導線離脱</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {row.dropoffSessions.toLocaleString("ja-JP")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">導線離脱率</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatRate(row.dropoffRate)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 md:block">
              <div className="grid grid-cols-[minmax(0,1.1fr)_88px_88px_96px] gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>ページ</span>
                <span className="text-right">到達</span>
                <span className="text-right">継続</span>
                <span className="text-right">導線離脱率</span>
              </div>
              <div className="divide-y divide-slate-200/80 bg-white/80">
                {rows.map((row) => (
                  <div
                    key={row.page}
                    className="grid grid-cols-[minmax(0,1.1fr)_88px_88px_96px] gap-3 px-4 py-4 text-sm text-slate-700"
                  >
                    <div className="break-all font-medium text-slate-900">
                      {row.page}
                    </div>
                    <div className="text-right">
                      {row.reachedSessions.toLocaleString("ja-JP")}
                    </div>
                    <div className="text-right">
                      {row.continuedSessions.toLocaleString("ja-JP")}
                    </div>
                    <div className="text-right font-semibold text-slate-900">
                      {formatRate(row.dropoffRate)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
