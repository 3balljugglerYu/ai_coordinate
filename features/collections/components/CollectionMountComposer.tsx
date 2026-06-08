"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  displayName,
  threshold,
  onClose,
  onGenerated,
}: Props) {
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
          mountImageUrl?: string;
          sharePath?: string;
          error?: string;
        };
        if (res.ok && data.status === "completed" && data.mountImageUrl) {
          onGenerated({
            categoryKey,
            mountImageUrl: data.mountImageUrl,
            sharePath: data.sharePath ?? null,
            completionId: data.sharePath
              ? data.sharePath.replace("/m/", "")
              : null,
          });
          return;
        }
        setErrorMsg(data.error ?? "台紙の生成に失敗しました");
        setStatus("error");
      } catch {
        setErrorMsg("台紙の生成に失敗しました");
        setStatus("error");
      }
    },
    [categoryKey, onGenerated],
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
          setErrorMsg("台紙に必要な衣装がそろっていません");
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
        <DialogHeader>
          <DialogTitle className="text-center">
            {displayName} の台紙を作る
          </DialogTitle>
        </DialogHeader>

        {status === "loading" ? (
          <p className="py-6 text-center text-sm text-gray-500">準備中…</p>
        ) : null}

        {status === "generating" ? (
          <p className="py-6 text-center text-sm text-gray-500">台紙を作成中…</p>
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
              台紙に載せる画像を衣装ごとに選んでください
            </p>
            {outfits.map((o, i) => (
              <div key={o.presetId}>
                <p className="mb-1 text-xs font-medium text-gray-600">
                  No.{String(i + 1).padStart(2, "0")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {o.images.map((img) => {
                    const isSelected = selected[o.presetId] === img.id;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() =>
                          setSelected((s) => ({ ...s, [o.presetId]: img.id }))
                        }
                        className={`relative aspect-square w-16 overflow-hidden rounded-md border-2 ${
                          isSelected ? "border-primary" : "border-transparent"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <Image
                          src={img.url}
                          alt=""
                          fill
                          sizes="64px"
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
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              この内容で台紙を作る
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
