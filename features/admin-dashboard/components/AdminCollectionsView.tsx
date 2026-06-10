"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CollectionKpi } from "@/features/admin-dashboard/lib/get-collection-kpi";
import type { CollectionCompletersPage } from "@/features/admin-dashboard/lib/get-collection-completions";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";

export interface AdminCollectionSeries {
  key: string;
  displayName: string;
  threshold: number;
}

interface ApiResponse {
  kpi: CollectionKpi;
  completers: CollectionCompletersPage;
}

export function AdminCollectionsView({
  series,
}: {
  series: AdminCollectionSeries[];
}) {
  const [selectedKey, setSelectedKey] = useState(series[0]?.key ?? "");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (categoryKey: string, pageIndex: number) => {
    if (!categoryKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/collections?categoryKey=${encodeURIComponent(categoryKey)}&page=${pageIndex}`,
        { cache: "no-store" },
      );
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
  }, []);

  useEffect(() => {
    void load(selectedKey, page);
  }, [load, selectedKey, page]);

  if (series.length === 0) {
    return (
      <p className="text-slate-600">
        コレクションシリーズはまだありません。プリセットカテゴリ編集で「コレクション設定」を有効化してください。
      </p>
    );
  }

  const kpi = data?.kpi;
  const completers = data?.completers;
  const totalPages = completers
    ? Math.max(1, Math.ceil(completers.total / completers.pageSize))
    : 1;

  const kpiCards: { label: string; value: number }[] = kpi
    ? [
        { label: "コンプリート達成数", value: kpi.completions },
        { label: "台紙生成数", value: kpi.completions },
        { label: "シリーズ生成数(成功)", value: kpi.seriesGenerations },
        { label: "訪問(ログイン)", value: kpi.visitsMember },
        { label: "訪問(ゲスト)", value: kpi.visitsGuest },
        { label: "生成成功", value: kpi.generates },
        { label: "ダウンロード", value: kpi.downloads },
        { label: "保存クリック", value: kpi.saveClicks },
        { label: "登録CTAクリック", value: kpi.signupClicks },
        { label: "台紙生成失敗", value: kpi.mountsFailed },
      ]
    : [];

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

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">読み込み中…</p> : null}

      {kpi ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpiCards.map((c) => (
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
      ) : null}

      {kpi && kpi.outfitCounts.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            衣装別の生成数
          </h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {kpi.outfitCounts.map((o, i) => (
              <li key={o.presetId} className="flex justify-between">
                <span className="font-mono text-xs text-slate-500">
                  #{i + 1} {o.presetId.slice(0, 8)}
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
              達成者一覧（{completers.total.toLocaleString()}人）
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
