"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import type { PendingCatalogReview } from "@/features/catalog-references/lib/review-admin-repository";
import {
  CATALOG_REVIEW_REASON_CATEGORIES,
  CATALOG_REVIEW_REASON_LABELS,
  type CatalogReviewReasonCategory,
} from "@/features/catalog-references/lib/review-reasons";

const TAKE_LABELS: Record<string, string> = {
  outfit: "衣装",
  angle: "アングル",
  pose: "ポーズ",
  background: "背景",
};

export function CatalogReviewsClient({ initialItems }: { initialItems: PendingCatalogReview[] }) {
  const [items, setItems] = useState(initialItems);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">審査待ちの作品はありません。</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">審査待ち {items.length}件(申請の古い順)</p>
      {items.map((item) => (
        <ReviewCard
          key={item.imageId}
          item={item}
          onDecided={() => setItems((current) => current.filter((row) => row.imageId !== item.imageId))}
        />
      ))}
    </div>
  );
}

function ReviewCard({ item, onDecided }: { item: PendingCatalogReview; onDecided: () => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState<CatalogReviewReasonCategory | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const decide = async (action: "approve" | "reject") => {
    if (action === "reject" && !category) {
      toast({ title: "理由の分類を選んでください", variant: "destructive" });
      return;
    }
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/catalog-reviews/${item.imageId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "approve" ? { action } : { action, reasonCategory: category, reason: reason.trim() || null },
        ),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "判定に失敗しました");
      }
      toast({ title: action === "approve" ? "承認しました" : "作り直しにしました" });
      onDecided();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "判定に失敗しました",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{item.nickname ?? "(名前未設定)"}</span>
          <span className="text-xs text-slate-400">{item.userId}</span>
          {item.submittedAt ? (
            <span>申請 {new Date(item.submittedAt).toLocaleString("ja-JP")}</span>
          ) : null}
          {item.derived ? <Badge variant="secondary">元の作品の見本を使った派生</Badge> : null}
          {item.referenceRejected ? (
            <Badge variant="destructive">この見本は、ほかの作品の審査で作り直しになっています</Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ImageBox label="見本(作者以外には見せない)" url={item.referenceUrl} />
          <ImageBox label="元の画像(Before)" url={item.beforeUrl} />
          <ImageBox label="できた画像(After)" url={item.afterUrl} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">まねたもの:</span>
          {item.takes.length > 0 ? (
            item.takes.map((take) => (
              <Badge key={take} variant="outline">
                {TAKE_LABELS[take] ?? take}
              </Badge>
            ))
          ) : (
            <span className="text-slate-400">(不明)</span>
          )}
        </div>

        <details className="rounded-md border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer text-slate-700">プロンプト</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
            {item.prompt ?? "(なし)"}
          </pre>
        </details>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => decide("approve")} pending={busy === "approve"} disabled={busy !== null}>
              承認する
            </Button>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor={`category-${item.imageId}`}>
              作り直しの理由
            </label>
            <select
              id={`category-${item.imageId}`}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value as CatalogReviewReasonCategory | "")}
            >
              <option value="">分類を選ぶ</option>
              {CATALOG_REVIEW_REASON_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATALOG_REVIEW_REASON_LABELS[value]}
                </option>
              ))}
            </select>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              placeholder="作者への説明(任意・500文字まで。そのまま通知に出ます)"
              rows={3}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={() => decide("reject")}
              pending={busy === "reject"}
              disabled={busy !== null}
            >
              作り直しにする
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageBox({ label, url }: { label: string; url: string | null }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-slate-500">{label}</figcaption>
      {url ? (
        // 見本は期限つきの URL(外の host)なので next/image を通さない
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="aspect-square w-full rounded-md bg-slate-100 object-contain" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
          画像なし
        </div>
      )}
    </figure>
  );
}
