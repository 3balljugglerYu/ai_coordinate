"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  CollectionKpiMetric,
  CollectionKpiWithParticipation,
  CollectionUuFunnel,
} from "@/features/admin-dashboard/lib/get-collection-kpi";
import type { CollectionRetentionCohort } from "@/features/admin-dashboard/lib/get-collection-retention";
import type { CollectionCampaignSummaries } from "@/features/admin-dashboard/lib/get-collection-campaign-summaries";

import type { CollectionCompletersPage } from "@/features/admin-dashboard/lib/get-collection-completions";
import type {
  CustomDashboardRange,
  DashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import {
  buildCollectionOutfitDailyCsv,
  buildCollectionSummaryCsv,
  buildCollectionTrendCsv,
} from "@/features/admin-dashboard/lib/build-collection-trend-csv";
import {
  describeMetricAvailability,
  resolveMetricAvailability,
} from "@/features/admin-dashboard/lib/collection-metric-availability";
import { AdminCollectionRangeControls } from "./AdminCollectionRangeControls";
import { AdminCollectionRetrospectiveNote } from "./AdminCollectionRetrospectiveNote";
import {
  AdminCollectionReading,
  AdminCollectionSection,
} from "./AdminCollectionSection";
import { AdminCsvExportButtons } from "./AdminCsvExportButtons";
import { AdminCollectionTrendChartPanel } from "./AdminCollectionTrendChartPanel";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";

/*
  継続率を語るのに最低限ほしい観測日数。これ未満は「暫定」と明示する。
  値の正本は get-collection-retention.ts の RETENTION_PROVISIONAL_DAYS だが、
  あちらは server-only のためクライアントから値を import できない(型のみ可)。
*/
const RETENTION_PROVISIONAL_DAYS = 7;

export interface AdminCollectionSeries {
  key: string;
  displayName: string;
  threshold: number;
}

interface ResolvedRange {
  fromIso: string;
  toIso: string;
  /** campaign=会期を使った / fallback=会期が無く30日 / explicit=手動指定 */
  source: "campaign" | "fallback" | "explicit";
  /** 会期の途中(開催中)で、終端を「今」に切り詰めたか */
  isOngoing: boolean;
}

interface ApiResponse {
  kpi: CollectionKpiWithParticipation;
  uuFunnel: CollectionUuFunnel;
  completers: CollectionCompletersPage;
  retention: CollectionRetentionCohort | null;
  summaries: CollectionCampaignSummaries;
  /** 所見の保存に id が要る(PATCH は id 指定・画面は key しか持たない) */
  category: {
    id: string;
    key: string;
    displayName: string;
    retrospectiveNote: string | null;
    retrospectiveNoteUpdatedAt: string | null;
  };
  operatorExcludedCount: number;
  resolvedRange: ResolvedRange;
}

function ratePct(part: number, total: number): string {
  if (total <= 0) return "N/A";
  return `${(Math.round((part / total) * 1000) / 10).toLocaleString("ja-JP")}%`;
}

function formatRangeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
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
  rangeParam,
}: {
  series: AdminCollectionSeries[];
  globalRange: DashboardRange;
  currentRange: CustomDashboardRange;
  currentFrom: string | null;
  currentTo: string | null;
  currentFromLabel: string;
  currentToLabel: string;
  /*
    URL の collectionRange をそのまま渡す(未指定なら "campaign")。
    会期の解決はサーバー側でしかできない(企画ごとの表示期間が要る)ため、
    ここではパースせず生の値を API へ送る。
  */
  rangeParam: string;
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
      range: string,
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
    void load(selectedKey, page, rangeParam, currentFrom, currentTo);
  }, [load, selectedKey, page, rangeParam, currentFrom, currentTo]);

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
  const resolvedRange = data?.resolvedRange ?? null;
  const operatorExcludedCount = data?.operatorExcludedCount ?? 0;
  const retention = data?.retention ?? null;
  const summaries = data?.summaries ?? null;
  const category = data?.category ?? null;
  const totalPages = completers
    ? Math.max(1, Math.ceil(completers.total / completers.pageSize))
    : 1;

  const kpiCards: {
    label: string;
    metric: CollectionKpiMetric;
    sub?: string;
    /** 計装開始日を持つ指標のキー(collection-metric-availability.ts) */
    metricKey?: string;
  }[] = kpi
      ? [
          /*
            以前は「コンプリート達成数」と「台紙生成数」が同じ kpi.completions を
            参照しており、常に同じ数字が2枚並んでいた。台紙生成は完走時に必ず走り、
            失敗は「台紙生成失敗」カードで別に見えるため、重複カードは落とす。
          */
          { label: "コンプリート達成数", metric: kpi.completions },
          { label: "シリーズ生成数(成功)", metric: kpi.seriesGenerations },
          {
            label: "訪問(ログイン)",
            metric: kpi.visitsMember,
            metricKey: "visitsMember",
          },
          {
            label: "訪問(ゲスト)",
            metric: kpi.visitsGuest,
            metricKey: "visitsGuest",
          },
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
          { label: "シェア", metric: kpi.shares, metricKey: "shares" },
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
  const summaryCsv =
    kpi && uuFunnel ? buildCollectionSummaryCsv(kpi, uuFunnel) : "";
  const summaryCsvFilename = csvSpan
    ? `collection-${selectedKey}-summary-${csvSpan}.csv`
    : `collection-${selectedKey}-summary.csv`;

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
        rangeParam={rangeParam}
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

      {category ? (
        <AdminCollectionRetrospectiveNote
          categoryId={category.id}
          displayName={category.displayName}
          note={category.retrospectiveNote}
          noteUpdatedAt={category.retrospectiveNoteUpdatedAt}
          onSaved={() =>
            void load(selectedKey, page, rangeParam, currentFrom, currentTo)
          }
        />
      ) : null}

      {kpi ? (
        <AdminCollectionSection
          step={1}
          title="サマリー"
          description="この企画で何がどれだけ起きたか。前期間比つき。"
          actions={
            <AdminCsvExportButtons
              csv={summaryCsv}
              filename={summaryCsvFilename}
            />
          }
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs text-slate-500">
                {resolvedRange
                  ? `集計期間: ${formatRangeLabel(resolvedRange.fromIso)} 〜 ${formatRangeLabel(
                      resolvedRange.toIso,
                    )}（前期間比つき）`
                  : "集計期間: 取得中"}
                {resolvedRange?.source === "campaign" ? (
                  <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                    会期
                  </span>
                ) : null}
                {resolvedRange?.isOngoing ? (
                  <span className="ml-1 text-[11px] text-slate-500">
                    開催中のため現時点まで
                  </span>
                ) : null}
              </p>
              {/*
                黙って引くと「なぜこの数字なのか」が追えなくなるので、
                引いた事実を常に見せる(ADR-002)。
              */}
              {operatorExcludedCount > 0 ? (
                <p className="text-[11px] text-slate-500">
                  運営 {operatorExcludedCount} 名を除外中（生成・完走・訪問・シェアすべて）
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpiCards.map((c) => {
              const availability = resolvedRange
                ? resolveMetricAvailability(
                    c.metricKey ?? c.label,
                    resolvedRange.fromIso,
                    resolvedRange.toIso,
                  )
                : { status: "available" as const, instrumentedSince: null };
              const note = describeMetricAvailability(availability);
              const isUnavailable = availability.status === "unavailable";

              return (
                <div
                  key={c.label}
                  className={
                    isUnavailable
                      ? "rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-3"
                      : "rounded-md border border-slate-200 bg-white p-3"
                  }
                >
                  <p className="text-xs text-slate-500">{c.label}</p>
                  {/*
                    計装前の期間で「0」を出すと、0件だったのか取れていないのかが
                    区別できない。数値そのものを出さず、理由を出す。
                  */}
                  {isUnavailable ? (
                    <p className="mt-1 text-base font-bold text-amber-700">
                      計測不可
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                        {c.metric.current.toLocaleString()}
                      </p>
                      <div className="mt-1">
                        <MetricDelta metric={c.metric} />
                      </div>
                    </>
                  )}
                  {note ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">
                      {note}
                    </p>
                  ) : null}
                  {c.sub ? (
                    <p className="mt-1 text-[11px] text-slate-500">{c.sub}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </AdminCollectionSection>
      ) : null}

      {uuFunnel ? (
        <AdminCollectionSection
          step={2}
          title="ファネル（ユニークユーザー）"
          description="訪問から生成・完走・シェアまで、何人が次に進んだか。ゲストは回線・端末単位の近似のため実人数とは一致しません。"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "訪問UU(ログイン)", value: uuFunnel.visitsMemberUu },
              { label: "訪問UU(ゲスト)", value: uuFunnel.visitsGuestUu },
              { label: "生成UU(ゲスト)", value: uuFunnel.generatesGuestUu },
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
                dt: "ゲスト訪問→生成率",
                dd: formatRatePct(uuFunnel.guestGenerateRatePct),
                note: "お試し生成UU / ゲスト訪問UU",
              },
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
        </AdminCollectionSection>
      ) : null}

      {kpi && kpi.outfitCounts.length > 0 ? (
        <AdminCollectionSection
          step={3}
          title="ページ別の生成と到達"
          description="生成数だけでは「人が多い」と「一人が粘った」を区別できません。到達UU（そのページを1回以上作った人数）と並べて読みます。CSV は日別 × ページのクロス集計です。"
          actions={
            <AdminCsvExportButtons
              csv={outfitDailyCsv}
              filename={outfitDailyCsvFilename}
            />
          }
        >
          {/*
            生成数だけだと「人が多かった」のか「一人が粘った」のかを区別できない。
            到達UU(そのページを1回以上作った人数)を並べて出す。
          */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">ページ</th>
                  <th className="py-1.5 pr-3 text-right font-medium">生成数</th>
                  <th className="py-1.5 pr-3 text-right font-medium">到達UU</th>
                  <th className="py-1.5 text-right font-medium">1人あたり</th>
                </tr>
              </thead>
              <tbody>
                {kpi.outfitCounts.map((o, i) => {
                  const reach =
                    kpi.participation.pageReach.find(
                      (r) => r.presetId === o.presetId,
                    )?.reachedUu ?? 0;
                  return (
                    <tr
                      key={o.presetId}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-1.5 pr-3 text-slate-700">
                        <span className="text-slate-400">#{i + 1}</span> {o.label}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {o.count.toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {reach.toLocaleString()}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">
                        {reach > 0
                          ? (Math.round((o.count / reach) * 10) / 10).toLocaleString(
                              "ja-JP",
                            )
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {kpi.participation.pageReach.length > 1 ? (
            <AdminCollectionReading>
              {(() => {
                const first = kpi.participation.pageReach[0].reachedUu;
                const last =
                  kpi.participation.pageReach[
                    kpi.participation.pageReach.length - 1
                  ].reachedUu;
                if (first === 0) return "まだ生成がありません。";
                return `最初のページに ${first.toLocaleString()}名、最後のページに ${last.toLocaleString()}名（${ratePct(last, first)}）が到達しています。`;
              })()}
            </AdminCollectionReading>
          ) : null}
        </AdminCollectionSection>
      ) : null}

      {kpi && kpi.participation.generatorUu > 0 ? (
        <AdminCollectionSection
          step={4}
          title="どこで止まったか"
          description="参加者が生成したページの種類数ごとの人数。離脱がどこに集中しているかを見ます。"
        >
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">生成到達UU</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {kpi.participation.generatorUu.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">1人あたり平均生成</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {kpi.participation.avgGenerationsPerUser?.toLocaleString("ja-JP") ??
                  "-"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">完走者の平均生成</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {kpi.participation.completerAvgGenerations?.toLocaleString(
                  "ja-JP",
                ) ?? "-"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">撮り直し率</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {kpi.participation.redoRatePct !== null
                  ? `${kpi.participation.redoRatePct.toLocaleString("ja-JP")}%`
                  : "-"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                同じページの2回目以降
              </p>
            </div>
          </div>
          <ul className="space-y-1 text-sm text-slate-700">
            {kpi.participation.pageCountDistribution.map((bucket) => {
              const isComplete =
                bucket.pages === kpi.participation.pageCountDistribution.length;
              return (
                <li
                  key={bucket.pages}
                  className="flex items-center justify-between gap-3"
                >
                  <span className={isComplete ? "font-semibold" : undefined}>
                    {bucket.pages}ページ
                    {isComplete ? "（完走）" : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        isComplete
                          ? "block h-1.5 bg-violet-600"
                          : "block h-1.5 bg-slate-300"
                      }
                      style={{
                        width: `${Math.round(
                          (bucket.users /
                            Math.max(
                              1,
                              ...kpi.participation.pageCountDistribution.map(
                                (b) => b.users,
                              ),
                            )) *
                            120,
                        )}px`,
                      }}
                    />
                    <span className="w-10 text-right tabular-nums">
                      {bucket.users.toLocaleString()}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <AdminCollectionReading>
            {(() => {
              const dist = kpi.participation.pageCountDistribution;
              const full = dist[dist.length - 1]?.users ?? 0;
              const total = kpi.participation.generatorUu;
              const half = Math.ceil(dist.length / 2);
              const reachedHalf = dist
                .filter((b) => b.pages >= half)
                .reduce((sum, b) => sum + b.users, 0);
              return `生成した ${total.toLocaleString()}名のうち ${full.toLocaleString()}名（${ratePct(full, total)}）が完走。${half}ページ以上まで進んだ ${reachedHalf.toLocaleString()}名に絞ると ${ratePct(full, reachedHalf)} が完走しています。`;
            })()}
          </AdminCollectionReading>
        </AdminCollectionSection>
      ) : null}

      {kpi ? (
        <AdminCollectionSection
          step={5}
          title="時系列（日別）"
          description="いつ動いたか。公開・告知の効果と、締切前の駆け込みが見えます。"
          actions={
            <AdminCsvExportButtons csv={trendCsv} filename={trendCsvFilename} />
          }
        >
          <AdminCollectionTrendChartPanel data={kpi.trend} />
        </AdminCollectionSection>
      ) : null}

      {retention ? (
        <AdminCollectionSection
          step={6}
          title="会期終了後の継続"
          description="会期のあとに「何かしら生成した」人の割合。企画が定着につながったかを見ます。"
        >
          {retention.isCampaignOngoing ? (
            <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              開催中のため、継続はまだ判定できません。
            </p>
          ) : (
            <>
              {retention.daysSinceEnd < RETENTION_PROVISIONAL_DAYS ? (
                <p className="mb-2 rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
                  終了から {retention.daysSinceEnd} 日ぶんの暫定値です（
                  {RETENTION_PROVISIONAL_DAYS} 日未満）。
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "生成到達者",
                    total: retention.generatorUu,
                    returned: retention.generatorReturned,
                  },
                  {
                    label: "完走者",
                    total: retention.completerUu,
                    returned: retention.completerReturned,
                  },
                  {
                    label: "会期中の新規登録",
                    total: retention.registeredUu,
                    returned: retention.registeredReturned,
                  },
                ].map((cohort) => (
                  <div
                    key={cohort.label}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <p className="text-xs text-slate-500">{cohort.label}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                      {ratePct(cohort.returned, cohort.total)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {cohort.total.toLocaleString()}名中{" "}
                      {cohort.returned.toLocaleString()}名が再訪
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </AdminCollectionSection>
      ) : null}

      {summaries && summaries.items.length > 0 ? (
        <AdminCollectionSection
          step={7}
          title="企画の横並び比較"
          description="カテゴリ単位の通算です（会期の定義が企画ごとに揺れるため）。完走率とページ数の関係が、次回の長さを決める材料になります。"
          actions={
            <p className="text-[11px] text-slate-400">
              最終更新 {formatRangeLabel(summaries.generatedAt)}
            </p>
          }
        >
          {/*
            会期ではなくカテゴリ単位の通算。企画ごとに会期の定義が揺れており
            (神コレは表示期間より前から生成が始まっている)、会期で切ると比較にならない。
          */}
          <p className="mb-3 text-[11px] text-slate-500">
            カテゴリ単位の通算です（会期の定義が企画ごとに揺れるため）。
            完走率とページ数の関係が、次回の長さを決める材料になります。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">企画</th>
                  <th className="py-1.5 pr-3 text-right font-medium">ページ数</th>
                  <th className="py-1.5 pr-3 text-right font-medium">生成数</th>
                  <th className="py-1.5 pr-3 text-right font-medium">生成UU</th>
                  <th className="py-1.5 pr-3 text-right font-medium">完走</th>
                  <th className="py-1.5 pr-3 text-right font-medium">完走率</th>
                  <th className="py-1.5 text-right font-medium">シェアUU</th>
                </tr>
              </thead>
              <tbody>
                {summaries.items.map((item) => (
                  <tr
                    key={item.categoryKey}
                    className={
                      item.categoryKey === selectedKey
                        ? "border-b border-slate-100 bg-violet-50/60 last:border-0"
                        : "border-b border-slate-100 last:border-0"
                    }
                  >
                    <td className="py-1.5 pr-3 text-slate-700">
                      {item.displayName}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {item.pageCount.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {item.generations.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {item.generatorUu.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {item.completerUu.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-slate-900">
                      {item.completionRatePct !== null
                        ? `${item.completionRatePct.toLocaleString("ja-JP")}%`
                        : "N/A"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {item.shareUu.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCollectionSection>
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
