"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";
import { CollectionSparkle } from "@/features/collections/components/CollectionSparkle";

/** コンポーザ背景用のオレンジ系きらめきパレット */
const MOUNT_SPARKLE_COLORS = [
  "#FB923C",
  "#F97316",
  "#FDBA74",
  "#FCD34D",
  "#FBBF24",
] as const;

interface OutfitOption {
  presetId: string;
  displayOrder: number;
  images: { id: string; url: string }[];
}

export interface MountGeneratedResult {
  categoryKey: string;
  mountImageUrl: string;
  sharePath: string | null;
  completionId: string | null;
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
}

interface Props {
  categoryKey: string;
  displayName: string;
  threshold: number;
  onClose: () => void;
  onGenerated: (result: MountGeneratedResult) => void;
}

type Status = "loading" | "selecting" | "generating" | "error";

/**
 * コンプリート時に「台紙に載せる画像を衣装ごとに選ぶ」コンポーザ。
 * - 各衣装の初期選択は最新の1枚。
 * - 重複が無ければ自動生成(従来の即時体験)。重複があれば選択UIを表示。
 * - 「この内容で台紙を作る」→ /api/collections/mount を selections 付きで呼ぶ。
 */
export function CollectionMountComposer({
  categoryKey,
  threshold,
  onClose,
  onGenerated,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [outfits, setOutfits] = useState<OutfitOption[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generate = useCallback(
    async (selections: Record<string, string>) => {
      setStatus("generating");
      setErrorMsg(null);
      try {
        const res = await fetch("/api/collections/mount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryKey, selections }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          mode?: string;
          mountImageUrl?: string;
          sharePath?: string;
          mountTemplateWidth?: number | null;
          mountTemplateHeight?: number | null;
          error?: string;
        };
        // book(めくれる日記帳)は結果モーダルではなく没入の本リーダーへ直接遷移する。
        if (res.ok && data.status === "completed" && data.mode === "book" && data.sharePath) {
          router.push(data.sharePath);
          return;
        }
        if (res.ok && data.status === "completed" && data.mountImageUrl) {
          onGenerated({
            categoryKey,
            mountImageUrl: data.mountImageUrl,
            sharePath: data.sharePath ?? null,
            completionId: data.sharePath
              ? data.sharePath.replace("/m/", "")
              : null,
            mountTemplateWidth: data.mountTemplateWidth ?? null,
            mountTemplateHeight: data.mountTemplateHeight ?? null,
          });
          return;
        }
        setErrorMsg(data.error ?? "カードの生成に失敗しました");
        setStatus("error");
      } catch {
        setErrorMsg("カードの生成に失敗しました");
        setStatus("error");
      }
    },
    [categoryKey, onGenerated, router],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/collections/options?categoryKey=${encodeURIComponent(categoryKey)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (active) {
            setErrorMsg("選択肢の取得に失敗しました");
            setStatus("error");
          }
          return;
        }
        const data = (await res.json()) as { outfits?: OutfitOption[] };
        const list = (data.outfits ?? []).slice(0, threshold);
        if (!active) return;
        if (list.length < threshold) {
          setErrorMsg("カードに必要な衣装がそろっていません");
          setStatus("error");
          return;
        }
        const initial: Record<string, string> = {};
        for (const o of list) {
          const first = o.images[0]?.id;
          if (first) initial[o.presetId] = first;
        }
        setOutfits(list);
        setSelected(initial);
        const hasDuplicates = list.some((o) => o.images.length > 1);
        if (!hasDuplicates) {
          // 重複なし → 即生成(従来どおりの即時体験)
          void generate(initial);
        } else {
          setStatus("selecting");
        }
      } catch {
        if (active) {
          setErrorMsg("選択肢の取得に失敗しました");
          setStatus("error");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [categoryKey, threshold, generate]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] w-[min(92vw,460px)] overflow-y-auto">
        {/* 背景: オレンジのきらめき。他モーダルと同じ「前面に1枚重ねる」方式
            (pointer-events-none・コンテンツ構造は触らない)。 */}
        <CollectionSparkle show colors={MOUNT_SPARKLE_COLORS} />
        <DialogHeader>
          <DialogTitle className="text-center">
            コレクションカードをつくる
          </DialogTitle>
        </DialogHeader>

        {status === "loading" ? (
          <p className="py-6 text-center text-sm text-gray-500">準備中…</p>
        ) : null}

        {status === "generating" ? (
          <div className="space-y-3 py-3">
            <p className="text-center text-sm text-gray-500">
              カードを作成中…
            </p>
            {/* スケルトン: 台紙のアスペクトと 2×2 スロットを模した
                shimmer プレースホルダ */}
            <div
              role="status"
              aria-live="polite"
              aria-label="カードを作成中"
              className="relative mx-auto w-56 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-amber-50 via-rose-50 to-violet-50"
              style={{ aspectRatio: mountAspectForCategory(categoryKey) }}
            >
              <style>{`
                @keyframes coll-shimmer {
                  0%   { transform: translateX(-120%); }
                  100% { transform: translateX(120%); }
                }
                .coll-shimmer-bar { animation: coll-shimmer 1.6s linear infinite; }
                @media (prefers-reduced-motion: reduce){
                  .coll-shimmer-bar { animation: none; }
                }
              `}</style>
              {/* 2×2 スロット枠 */}
              <div className="absolute inset-0 grid grid-cols-2 gap-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-md bg-white/70"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100" />
                  </div>
                ))}
              </div>
              {/* 斜め shimmer */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                  className="coll-shimmer-bar absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/65 to-transparent"
                  aria-hidden
                />
              </div>
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        ) : null}

        {status === "selecting" ? (
          <div className="space-y-4">
            <p className="text-center text-xs text-gray-500">
              コレクションカードに載せる画像を選択してください。
            </p>
            {outfits.map((o, i) => (
              <div key={o.presetId}>
                <p className="mb-1 text-xs font-medium text-gray-600">
                  No.{String(i + 1).padStart(2, "0")}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {o.images.map((img) => {
                    const isSelected = selected[o.presetId] === img.id;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() =>
                          setSelected((s) => ({ ...s, [o.presetId]: img.id }))
                        }
                        className={`relative aspect-square w-full overflow-hidden rounded-md border-2 ${
                          isSelected ? "border-orange-500" : "border-transparent"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <Image
                          src={img.url}
                          alt=""
                          fill
                          sizes="130px"
                          className="object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void generate(selected)}
              className="w-full rounded-md bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-[0_3px_0_rgba(234,88,12,0.4)] hover:opacity-90"
            >
              この内容で作成する
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
