"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * クリエイター提供フォーム用の「/style での見え方」フローティングプレビュー(PinP)。
 * タイトル・種類・サムネ(3:4)を入力すると、スマホ風フレーム内の Style カードに即時反映する。
 * 右下固定・最小化トグル付き(モバイルでフォームを隠さないため)。
 */
export function CreatorPromptCardPreview({
  title,
  thumbnailUrl,
  categoryLabel,
}: {
  title: string;
  thumbnailUrl: string | null;
  categoryLabel: string;
}) {
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-amber-600"
      >
        プレビューを表示
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-3 z-40 w-[176px] sm:w-[200px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
          /style での見え方
        </span>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] text-gray-600 shadow hover:bg-white"
        >
          最小化
        </button>
      </div>

      {/* スマホ風フレーム */}
      <div className="overflow-hidden rounded-[1.6rem] border-[6px] border-gray-900 bg-white shadow-2xl">
        {/* ノッチ */}
        <div className="flex justify-center bg-gray-900 py-1">
          <div className="h-1 w-10 rounded-full bg-gray-700" />
        </div>

        <div className="bg-gray-50 px-2 pb-3 pt-2">
          <p className="mb-1.5 text-[11px] font-bold text-gray-800">Style</p>

          <div className="grid grid-cols-2 gap-1.5">
            {/* あなたのカード(ライブ反映) */}
            <PreviewCard
              title={title || "タイトル"}
              thumbnailUrl={thumbnailUrl}
              categoryLabel={categoryLabel}
              highlighted
            />
            {/* 文脈用のダミー(他の人のスタイル) */}
            <PreviewCard
              title="ほかのスタイル"
              thumbnailUrl={null}
              categoryLabel=""
              dimmed
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  title,
  thumbnailUrl,
  categoryLabel,
  highlighted = false,
  dimmed = false,
}: {
  title: string;
  thumbnailUrl: string | null;
  categoryLabel: string;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white ${
        highlighted ? "border-amber-400 ring-2 ring-amber-300" : "border-gray-200"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      {/* 3:4 サムネ */}
      <div className="relative aspect-[3/4] w-full bg-gray-100">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            sizes="100px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-gray-400">
            サムネ
          </div>
        )}
        {categoryLabel ? (
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white">
            {categoryLabel}
          </span>
        ) : null}
      </div>
      {/* タイトル + 提供者クレジット */}
      <div className="px-1 py-1">
        <p className="truncate text-[9px] font-medium text-gray-800">{title}</p>
        {highlighted ? (
          <div className="mt-0.5 flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="truncate text-[8px] text-gray-500">提供: あなた</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
