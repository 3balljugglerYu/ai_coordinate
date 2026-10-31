"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import type { PendingCatalogReview } from "@/features/catalog-references/lib/review-admin-repository";
import { isBlankPrompt } from "@/shared/generation/catalog-reference";
import {
  CATALOG_REVIEW_REASON_CATEGORIES,
  CATALOG_REVIEW_REASON_LABELS,
  CATALOG_REVIEW_REASON_MAX_CHARS,
  catalogReviewReasonRequired,
  type CatalogReviewReasonCategory,
} from "@/features/catalog-references/lib/review-reasons";

/** もう判定された・見つからない作品は、押し直しても変わらないので一覧から消す */
const GONE_ERROR_CODES = new Set(["CATALOG_REVIEW_ALREADY_DECIDED", "CATALOG_REVIEW_NOT_FOUND"]);

// サーバーで描いた時刻とブラウザで描き直した時刻が食い違わないように、日本時間に決めて出す
const submittedAtFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "short",
  timeStyle: "short",
});

const TAKE_LABELS: Record<string, string> = {
  outfit: "衣装",
  angle: "アングル",
  pose: "ポーズ",
  background: "背景",
};

/** 見本が使えなくなった作品と、同じ見本のほかの作品に印を付ける */
function markReferenceUnavailable(rows: PendingCatalogReview[], target: PendingCatalogReview) {
  return rows.map((row) =>
    row.imageId === target.imageId || (target.referenceId && row.referenceId === target.referenceId)
      ? { ...row, referenceUnavailable: true }
      : row,
  );
}

export function CatalogReviewsClient({
  initialItems,
  limit,
}: {
  initialItems: PendingCatalogReview[];
  /** 一度に並べる数。これと同じ数が来たら、まだ続きがあるかもしれない */
  limit: number;
}) {
  const [items, setItems] = useState(initialItems);
  const mayHaveMore = initialItems.length >= limit;

  const markImageUnavailable = (target: PendingCatalogReview) => {
    setItems((current) =>
      current.map((row) => (row.imageId === target.imageId ? { ...row, imageUnavailable: true } : row)),
    );
  };

  const handleDecided = (decided: PendingCatalogReview, action: "approve" | "reject" | "gone") => {
    setItems((current) => {
      const rest = current.filter((row) => row.imageId !== decided.imageId);
      // 作り直しは見本そのものを止めるので、同じ見本のほかの作品にも印を出す
      return action === "reject" ? markReferenceUnavailable(rest, decided) : rest;
    });
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {mayHaveMore
          ? "表示した分は判定し終えました。続きがあれば、ページを読み直すと出ます。"
          : "審査待ちの作品はありません。"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        審査待ち {items.length}件(申請の古い順{mayHaveMore ? `に最大${limit}件を表示。続きがあれば、判定し終えたあとに読み直すと出ます` : ""})
      </p>
      {items.map((item) => (
        <ReviewCard
          key={item.imageId}
          item={item}
          onDecided={(action) => handleDecided(item, action)}
          onImageUnavailable={() => markImageUnavailable(item)}
          // 断られた理由が「元の作品や見本が消された」なら、その作品の系統だけの話なので、
          // 同じ見本のほかのカードには広げない(作り直しで見本が止まったときだけ広げる)
          onReferenceUnavailable={() =>
            setItems((current) =>
              current.map((row) => (row.imageId === item.imageId ? { ...row, referenceUnavailable: true } : row)),
            )
          }
        />
      ))}
    </div>
  );
}

function ReviewCard({
  item,
  onDecided,
  onImageUnavailable,
  onReferenceUnavailable,
}: {
  item: PendingCatalogReview;
  onDecided: (action: "approve" | "reject" | "gone") => void;
  /** 承認を、作品が公開停止などのために断られた(画面を開いたあとに止まった) */
  onImageUnavailable: () => void;
  /** 承認を、見本が使えないために断られた(画面を開いたあとに止まった・元の作品が消された) */
  onReferenceUnavailable: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState<CatalogReviewReasonCategory | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const decide = async (action: "approve" | "reject") => {
    if (action === "reject" && !category) {
      toast({ title: "理由の分類を選んでください", variant: "destructive" });
      return;
    }
    if (action === "reject" && catalogReviewReasonRequired(category as CatalogReviewReasonCategory) && !reason.trim()) {
      toast({ title: "「そのほか」のときは、作者への説明を書いてください", variant: "destructive" });
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
      const body = (await res.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
      if (!res.ok) {
        if (body?.errorCode === "CATALOG_REVIEW_IMAGE_UNAVAILABLE") {
          onImageUnavailable();
        }
        if (body?.errorCode === "CATALOG_REVIEW_REFERENCE_UNAVAILABLE") {
          onReferenceUnavailable();
        }
        if (body?.errorCode && GONE_ERROR_CODES.has(body.errorCode)) {
          toast({ title: body.error || "この作品はもう判定されています" });
          onDecided("gone");
          return;
        }
        throw new Error(body?.error || "判定に失敗しました");
      }
      toast({ title: action === "approve" ? "承認しました" : "作り直しにしました" });
      onDecided(action);
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
            <span>申請 {submittedAtFormat.format(new Date(item.submittedAt))}</span>
          ) : null}
          {item.derived ? <Badge variant="secondary">元の作品の見本を使った派生</Badge> : null}
          {item.referenceUnavailable ? (
            <Badge variant="destructive">この作品の見本は使えません(作り直しになったか、元の作品や見本が消されています)</Badge>
          ) : null}
          {item.imageUnavailable ? (
            <Badge variant="destructive">公開停止などのため承認できません(作り直しにはできます)</Badge>
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
            {/* プロンプトなしで作った作品(「イラストから」)は本文が空文字 */}
            {item.prompt == null || isBlankPrompt(item.prompt) ? "(なし)" : item.prompt}
          </pre>
        </details>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => decide("approve")}
              pending={busy === "approve"}
              // 見本が使えない作品は DB が承認を断る(作り直しにはできる)
              disabled={busy !== null || item.imageUnavailable || item.referenceUnavailable}
            >
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
              onChange={(event) =>
                setReason(Array.from(event.target.value).slice(0, CATALOG_REVIEW_REASON_MAX_CHARS).join(""))
              }
              placeholder="作者への説明(500文字まで。そのまま通知に出ます。「そのほか」のときは必須)"
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
