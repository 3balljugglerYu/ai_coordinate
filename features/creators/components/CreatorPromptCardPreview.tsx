"use client";

import { useState } from "react";
import Image from "next/image";

export interface CreatorPromptPreviewBadge {
  label: string;
  badgeColor: string;
  badgeTextColor: string;
}

/**
 * クリエイター提供フォーム用の「/style での見え方」フローティングプレビュー(PinP)。
 * 縦長のスマホ風フレーム内に、本物の StylePresetPreviewCard に寄せた Style カードを表示し、
 * タイトル・種類(カテゴリバッジ)・サムネ(3:4)・申請者アイコンを即時反映する。
 * 右下固定・最小化トグル付き。
 */
export function CreatorPromptCardPreview({
  title,
  thumbnailUrl,
  badge,
  avatarUrl,
}: {
  title: string;
  thumbnailUrl: string | null;
  badge: CreatorPromptPreviewBadge | null;
  avatarUrl: string | null;
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
    <div className="fixed bottom-4 right-3 z-40 w-[168px] sm:w-[188px]">
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

      {/* 縦長スマホ風フレーム */}
      <div className="overflow-hidden rounded-[2rem] border-[7px] border-gray-900 bg-gray-900 shadow-2xl">
        {/* ノッチ */}
        <div className="relative flex justify-center py-1.5">
          <div className="h-1.5 w-12 rounded-full bg-gray-700" />
        </div>

        {/* 画面(縦長・スクロール風に下を少し切る) */}
        <div className="h-[300px] overflow-hidden rounded-t-xl bg-gray-50 px-2 pt-2.5">
          <p className="mb-2 px-0.5 text-[12px] font-bold text-gray-900">Style</p>

          <div className="grid grid-cols-2 gap-2">
            {/* あなたのカード(ライブ反映) */}
            <PreviewCard
              title={title || "タイトル"}
              thumbnailUrl={thumbnailUrl}
              badge={badge}
              avatarUrl={avatarUrl}
              highlighted
            />
            {/* 文脈用のダミー */}
            <PreviewCard
              title="ほかのスタイル"
              thumbnailUrl={null}
              badge={null}
              avatarUrl={null}
              dimmed
            />
            <PreviewCard
              title="ほかのスタイル"
              thumbnailUrl={null}
              badge={null}
              avatarUrl={null}
              dimmed
            />
            <PreviewCard
              title="ほかのスタイル"
              thumbnailUrl={null}
              badge={null}
              avatarUrl={null}
              dimmed
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 本物の StylePresetPreviewCard に寄せたミニカード(3:4画像 + 左下バッジ + 下部[アイコン]+[タイトル])。 */
function PreviewCard({
  title,
  thumbnailUrl,
  badge,
  avatarUrl,
  highlighted = false,
  dimmed = false,
}: {
  title: string;
  thumbnailUrl: string | null;
  badge: CreatorPromptPreviewBadge | null;
  avatarUrl: string | null;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white ${
        highlighted ? "border-amber-400 ring-2 ring-amber-300" : "border-gray-200"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      {/* 3:4 サムネ(object-top) + 左下バッジ */}
      <div className="relative aspect-[3/4] w-full bg-gray-100">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            sizes="90px"
            className="object-cover object-top"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-gray-400">
            サムネ
          </div>
        )}
        {badge ? (
          <span
            className="absolute bottom-1 left-1 inline-flex max-w-[85%] items-center truncate rounded px-1 py-[1px] text-[8px] font-semibold leading-tight shadow-sm"
            style={{ backgroundColor: badge.badgeColor, color: badge.badgeTextColor }}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      {/* 下部バー: [アイコン][タイトル] の1行(本物準拠) */}
      <div className="flex items-center gap-1 border-t bg-white px-1.5 py-1">
        {highlighted ? (
          avatarUrl ? (
            <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full bg-gray-200">
              <Image
                src={avatarUrl}
                alt="申請者"
                fill
                sizes="14px"
                className="object-cover"
                unoptimized
              />
            </span>
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-amber-300" />
          )
        ) : null}
        <p className="truncate text-[9px] font-medium text-gray-800">{title}</p>
      </div>
    </div>
  );
}
