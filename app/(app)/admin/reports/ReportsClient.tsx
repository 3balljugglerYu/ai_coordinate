"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Flag,
  AlertTriangle,
  LayoutList,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ReportItem {
  id: string;
  postId: string;
  reporterId: string;
  reporterNickname: string | null;
  categoryId: string;
  categoryLabel: string;
  subcategoryId: string;
  subcategoryLabel: string;
  details: string | null;
  weight: number;
  createdAt: string;
  postImageUrl: string | null;
  postCaption: string | null;
  postModerationStatus: string | null;
}

interface AggregatedItem {
  postId: string;
  reportCount: number;
  weightedScore: number;
  recentCount: number;
  latestReportAt: string;
  postImageUrl: string | null;
  postCaption: string | null;
  postModerationStatus: string | null;
  threshold: number;
  overThreshold: boolean;
}

const PAGE_SIZE = 50;

type ViewMode = "individual" | "aggregated";

export function ReportsClient() {
  const [viewMode, setViewMode] = useState<ViewMode>("aggregated");

  const [items, setItems] = useState<ReportItem[]>([]);
  const [aggregatedItems, setAggregatedItems] = useState<AggregatedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const fetchReports = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reports?limit=${PAGE_SIZE}&offset=${off}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "取得に失敗しました");
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setOffset(off);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAggregated = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reports/aggregated?limit=${PAGE_SIZE}&offset=${off}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "取得に失敗しました");
      setAggregatedItems(data.items || []);
      setTotal(data.total ?? 0);
      setOffset(off);
    } catch (err) {
      console.error(err);
      setAggregatedItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "individual") {
      fetchReports(0);
    } else {
      fetchAggregated(0);
    }
  }, [viewMode, fetchReports, fetchAggregated]);

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const handlePrev = () => {
    if (viewMode === "individual") fetchReports(offset - PAGE_SIZE);
    else fetchAggregated(offset - PAGE_SIZE);
  };

  const handleNext = () => {
    if (viewMode === "individual") fetchReports(offset + PAGE_SIZE);
    else fetchAggregated(offset + PAGE_SIZE);
  };

  return (
    <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Flag className="h-5 w-5 text-violet-600" />
            通報履歴
            <span className="text-sm font-normal text-slate-500">
              （全{total}件）
            </span>
          </h2>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "aggregated" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("aggregated")}
            >
              <Layers className="mr-1 h-4 w-4" />
              投稿別集約
            </Button>
            <Button
              variant={viewMode === "individual" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("individual")}
            >
              <LayoutList className="mr-1 h-4 w-4" />
              通報一覧
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : viewMode === "aggregated" ? (
          aggregatedItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              通報はまだありません。
            </p>
          ) : (
            <>
              <ul className="space-y-4">
                {aggregatedItems.map((item) => (
                  <li
                    key={item.postId}
                    className={`rounded-lg border p-4 ${
                      item.overThreshold
                        ? "border-amber-400/80 bg-amber-50/80"
                        : "border-slate-200/80 bg-slate-50/50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {item.postImageUrl && (
                        <Link
                          href={`/posts/${item.postId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                        >
                          <Image
                            src={item.postImageUrl}
                            alt=""
                            width={120}
                            height={120}
                            className="h-24 w-24 object-cover"
                          />
                        </Link>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.overThreshold && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              しきい値超過
                            </span>
                          )}
                          {item.postModerationStatus && (
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                              {item.postModerationStatus}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          通報数: {item.reportCount} · 加重スコア:{" "}
                          {item.weightedScore.toFixed(1)} · しきい値:{" "}
                          {item.threshold}
                          {item.recentCount > 0 && (
                            <> · 直近10分: {item.recentCount}件</>
                          )}
                        </p>
                        <Link
                          href={`/posts/${item.postId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-sm text-violet-600 hover:underline"
                        >
                          投稿へ →
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          最終通報:{" "}
                          {new Date(item.latestReportAt).toLocaleString("ja-JP")}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={!hasPrev || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  前へ
                </Button>
                <span className="text-sm text-slate-600">
                  {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} / {total}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={!hasNext || loading}
                >
                  次へ
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">
            通報はまだありません。
          </p>
        ) : (
          <>
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    {item.postImageUrl && (
                      <Link
                        href={`/posts/${item.postId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                      >
                        <Image
                          src={item.postImageUrl}
                          alt=""
                          width={120}
                          height={120}
                          className="h-24 w-24 object-cover"
                        />
                      </Link>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-sm font-medium text-violet-800">
                          {item.categoryLabel} / {item.subcategoryLabel}
                        </span>
                        {item.postModerationStatus && (
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                            {item.postModerationStatus}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        通報者:{" "}
                        <Link
                          href={`/admin/users/${item.reporterId}`}
                          className="text-violet-600 hover:underline"
                        >
                          {item.reporterNickname ||
                            item.reporterId.slice(0, 8) + "..."}
                        </Link>
                        {" · "}
                        <Link
                          href={`/posts/${item.postId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-600 hover:underline"
                        >
                          投稿へ
                        </Link>
                      </p>
                      {item.details && (
                        <p className="mt-1 text-sm text-slate-700">
                          {item.details}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString("ja-JP")} ·
                        weight: {item.weight}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={!hasPrev || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                前へ
              </Button>
              <span className="text-sm text-slate-600">
                {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} / {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={!hasNext || loading}
              >
                次へ
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
