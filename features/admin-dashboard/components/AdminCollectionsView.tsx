"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  CollectionKpi,
  CollectionKpiMetric,
  CollectionUuFunnel,
} from "@/features/admin-dashboard/lib/get-collection-kpi";
import type { CollectionCompletersPage } from "@/features/admin-dashboard/lib/get-collection-completions";
import type {
  CustomDashboardRange,
  DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import {
  buildCollectionOutfitDailyCsv,
  buildCollectionTrendCsv,
} from "@/features/admin-dashboard/lib/build-collection-trend-csv";
import { AdminCollectionRangeControls } from "./AdminCollectionRangeControls";
import { AdminCsvExportButtons } from "./AdminCsvExportButtons";
import { AdminCollectionTrendChartPanel } from "./AdminCollectionTrendChartPanel";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";

export interface AdminCollectionSeries {
  key: string;
  displayName: string;
  threshold: number;
}

interface ApiResponse {
  kpi: CollectionKpi;
  uuFunnel: CollectionUuFunnel;
  completers: CollectionCompletersPage;
}

function formatRatePct(value: number | null): string {
  return value === null ? "N/A" : `${value.toLocaleString("ja-JP")}%`;
}

function MetricDelta({ metric }: { metric: CollectionKpiMetric }) {
  if (metric.deltaPct === null) {
    return (
      <span className="text-[11px] font-medium uppercase tracking-wide text-violet-600">
        New
      </span>
    );
  }

  if (metric.deltaDirection === "flat") {
    return <span className="text-[11px] font-medium text-slate-400">±0%</span>;
  }

  const Icon = metric.deltaDirection === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500">
      <Icon className="h-3 w-3" aria-hidden />
      {metric.deltaPct.toLocaleString("ja-JP")}%
    </span>
  );
}

export function AdminCollectionsView({
  series,
  globalRange,
  currentRange,
  currentFrom,
  currentTo,
  currentFromLabel,
  currentToLabel,
}: {
  series: AdminCollectionSeries[];
  globalRange: DashboardRange;
  currentRange: CustomDashboardRange;
  currentFrom: string | null;
  currentTo: string | null;
  currentFromLabel: string;
  currentToLabel: string;
}) {
  const [selectedKey, setSelectedKey] = useState(series[0]?.key ?? "");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (
      categoryKey: string,
      pageIndex: number,
      range: CustomDashboardRange,
      from: string | null,
      to: string | null,
    ) => {
      if (!categoryKey) return;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          categoryKey,
          page: String(pageIndex),
          range,
        });
        if (range === "custom" && from && to) {
          query.set("from", from);
          query.set("to", to);
        }
        const res = await fetch(`/api/admin/collections?${query.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError(`取得に失敗しました (${res.status})`);
          setData(null);
          return;
        }
        setData((await res.json()) as ApiResponse);
      } catch {
        setError("取得に失敗しました");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(selectedKey, page, currentRange, currentFrom, currentTo);
  }, [load, selectedKey, page, currentRange, currentFrom, currentTo]);

  if (series.length === 0) {
    return (
      <p className="text-slate-600">
        コレクションシリーズはまだありません。プリセットカテゴリ編集で「コレクション設定」を有効化してください。
      </p>
    );
  }

  const kpi = data?.kpi;
  const uuFunnel = data?.uuFunnel;
  const completers = data?.completers;
  const totalPages = completers
    ? Math.max(1, Math.ceil(completers.total / completers.pageSize))
    : 1;

  const kpiCards: { label: string; metric: CollectionKpiMetric; sub?: string }[] =
    kpi
      ? [
          { label: "コンプリート達成数", metric: kpi.completions },
          { label: "台紙生成数", metric: kpi.completions },
          { label: "シリーズ生成数(成功)", metric: kpi.seriesGenerations },
          { label: "訪問(ログイン)", metric: kpi.visitsMember },
          { label: "訪問(ゲスト)", metric: kpi.visitsGuest },
          {
            label: "生成成功",
            metric: kpi.generates,
            sub:
              kpi.generates.member !== undefined
                ? `ログイン ${kpi.generates.member.toLocaleString()} / お試し ${(
                    kpi.generates.guest ?? 0
                  ).toLocaleString()}`
                : undefined,
          },
          {
            label: "ダウンロード",
            metric: kpi.downloads,
            sub:
              kpi.downloads.member !== undefined
                ? `ログイン ${kpi.downloads.member.toLocaleString()} / ゲスト ${(
                    kpi.downloads.guest ?? 0
                  ).toLocaleString()}`
                : undefined,
          },
          { label: "保存クリック", metric: kpi.saveClicks },
          { label: "登録CTAクリック", metric: kpi.signupClicks },
          { label: "シェア", metric: kpi.shares },
          { label: "台紙生成失敗", metric: kpi.mountsFailed },
        ]
      : [];

  const csvSpan =
    kpi && kpi.trend.length > 0
      ? `${kpi.trend[0].bucket}_${kpi.trend[kpi.trend.length - 1].bucket}`
      : null;
  const trendCsv = kpi ? buildCollectionTrendCsv(kpi.trend) : "";
  const trendCsvFilename = csvSpan
    ? `collection-${selectedKey}-${csvSpan}.csv`
    : `collection-${selectedKey}.csv`;
  const outfitDailyCsv = kpi ? buildCollectionOutfitDailyCsv(kpi) : "";
  const outfitDailyCsvFilename = csvSpan
    ? `collection-${selectedKey}-outfit-${csvSpan}.csv`
    : `collection-${selectedKey}-outfit.csv`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setSelectedKey(s.key);
              setPage(0);
            }}
            className={
              s.key === selectedKey
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            }
          >
            {s.displayName}（{s.threshold}種）
          </button>
        ))}
      </div>

      <AdminCollectionRangeControls
        globalRange={globalRange}
        currentRange={currentRange}
        currentFrom={currentFrom}
        currentTo={currentTo}
        currentFromLabel={currentFromLabel}
        currentToLabel={currentToLabel}
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">読み込み中…</p> : null}

      {kpi ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {currentRange === "custom"
              ? `集計期間: ${currentFromLabel} 〜 ${currentToLabel}（前期間比つき）`
              : `集計期間: 直近 ${currentRange}（前期間比つき）`}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpiCards.map((c) => (
              <div
                key={c.label}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {c.metric.current.toLocaleString()}
                </p>
                <div className="mt-1">
                  <MetricDelta metric={c.metric} />
                </div>
                {c.sub ? (
                  <p className="mt-1 text-[11px] text-slate-500">{c.sub}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {kpi ? (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">日別トレンド</h3>
            <AdminCsvExportButtons csv={trendCsv} filename={trendCsvFilename} />
          </div>
          <AdminCollectionTrendChartPanel data={kpi.trend} />
        </div>
      ) : null}

      {uuFunnel ? (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">
            ユニークユーザー・ファネル（ログインのみ）
          </h3>
          <p className="mb-3 mt-1 text-[11px] text-slate-500">
            生成→コンプリート→シェアのUU歩留まり、および期間内に新規登録したUUのコンプリート到達。
            ゲストは識別子を持たずUU計測できないためログイン側のみです。
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "生成UU", value: uuFunnel.generatesUu },
              { label: "コンプリートUU", value: uuFunnel.completionsUu },
              { label: "シェアUU", value: uuFunnel.sharesUu },
              { label: "期間内登録UU", value: uuFunnel.registeredUu },
              { label: "登録→コンプリート", value: uuFunnel.registeredCompletedUu },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {c.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                dt: "コンプリート到達率 (B-2)",
                dd: formatRatePct(uuFunnel.reachRatePct),
                note: "コンプリートUU / 生成UU",
              },
              {
                dt: "登録→コンプリート率 (A-5)",
                dd: formatRatePct(uuFunnel.registeredReachRatePct),
                note: "期間内登録UUのうち到達",
              },
              {
                dt: "登録後 未コンプリート (A-8)",
                dd: `${uuFunnel.registeredNotCompletedUu.toLocaleString()}人`,
                note: "登録したが6柱未完走",
              },
              {
                dt: "コンプリート後 未シェア (A-8)",
                dd: `${uuFunnel.completedNotSharedUu.toLocaleString()}人`,
                note: "完走したが未シェア",
              },
            ].map((item) => (
              <div
                key={item.dt}
                className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2"
              >
                <dt className="text-xs text-slate-500">{item.dt}</dt>
                <dd className="font-semibold text-slate-900">{item.dd}</dd>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.note}</p>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {kpi && kpi.outfitCounts.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              柱別の生成数
            </h3>
            <AdminCsvExportButtons
              csv={outfitDailyCsv}
              filename={outfitDailyCsvFilename}
            />
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            CSV は「日別 × 柱別」のクロス集計です（1日1柱お披露目の効果検証用）。
          </p>
          <ul className="space-y-1 text-sm text-slate-700">
            {kpi.outfitCounts.map((o, i) => (
              <li key={o.presetId} className="flex justify-between gap-3">
                <span className="truncate text-slate-700">
                  #{i + 1} {o.label}
                </span>
                <span className="tabular-nums">{o.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {completers ? (
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">
              達成者一覧（累計 {completers.total.toLocaleString()}人）
            </h3>
          </div>
          {completers.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              まだ達成者はいません。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {completers.items.map((c) => (
                <li key={c.completionId} className="flex items-center gap-3 px-4 py-3">
                  {c.mountImageUrl ? (
                    <div
                      className="relative h-14 shrink-0 overflow-hidden rounded border border-slate-200"
                      style={{ aspectRatio: mountAspectForCategory(selectedKey) }}
                    >
                      <Image
                        src={c.mountImageUrl}
                        alt="台紙"
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/users/${c.userId}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:underline"
                    >
                      {c.nickname || c.userId.slice(0, 12)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {c.completedAt
                        ? new Date(c.completedAt).toLocaleString("ja-JP")
                        : "-"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                前へ
              </button>
              <span className="text-slate-500">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
              >
                次へ
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
