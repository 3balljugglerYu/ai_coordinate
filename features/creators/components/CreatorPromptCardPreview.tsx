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
  creditNickname,
}: {
  title: string;
  thumbnailUrl: string | null;
  badge: CreatorPromptPreviewBadge | null;
  avatarUrl: string | null;
  creditNickname: string | null;
}) {
  const [size, setSize] = useState<"large" | "medium" | "minimized">("medium");

  if (size === "minimized") {
    return (
      <button
        type="button"
        onClick={() => setSize("medium")}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-amber-600"
      >
        プレビューを表示
      </button>
    );
  }

  const sizeBtn = (key: "large" | "medium", label: string) => (
    <button
      type="button"
      onClick={() => setSize(key)}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        size === key
          ? "bg-amber-500 text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* サイズ操作: 常に画面右上に固定(プレビューを拡大しても隠れない) */}
      <div className="fixed right-3 top-3 z-50 flex items-center gap-0.5 rounded-full bg-white/95 p-1 shadow-lg ring-1 ring-black/5">
        <span className="px-1 text-[10px] font-medium text-gray-500">見え方</span>
        {sizeBtn("large", "大")}
        {sizeBtn("medium", "中")}
        <button
          type="button"
          onClick={() => setSize("minimized")}
          className="rounded-full px-2.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
        >
          最小化
        </button>
      </div>

      {/* スマホ風プレビュー(右下固定。大は約3/4を埋める) */}
      <div className="fixed bottom-4 right-3 z-40">
        <div
          className="w-[180px] sm:w-[196px]"
          style={{
            transformOrigin: "bottom right",
            transform: size === "large" ? "scale(1.85)" : undefined,
          }}
        >
          {/* 縦長スマホ風フレーム */}
          <div className="overflow-hidden rounded-[2rem] border-[7px] border-gray-900 bg-gray-900 shadow-2xl">
        {/* ノッチ */}
        <div className="relative flex justify-center py-1.5">
          <div className="h-1.5 w-12 rounded-full bg-gray-700" />
        </div>

        {/* 画面(縦長・スクロール風に下を少し切る) */}
        <div className="h-[392px] overflow-hidden rounded-t-xl bg-gray-50 px-2.5 pt-2.5">
          {/* セクション1: スタイル選択(横スクロールのカード列) */}
          <p className="px-0.5 text-[11px] font-semibold text-gray-900">
            スタイル選択
          </p>
          <p className="mb-1.5 px-0.5 text-[8px] leading-tight text-gray-400">
            好きなスタイルを選んでください
          </p>
          <div className="flex gap-1.5 overflow-hidden">
            {/* あなたのカード(ライブ反映) */}
            <div className="w-[100px] shrink-0">
              <PreviewCard
                title={title || "タイトル"}
                thumbnailUrl={thumbnailUrl}
                badge={badge}
                avatarUrl={avatarUrl}
                highlighted
              />
            </div>
            {/* 文脈用のダミー(横スクロールで続く感じ) */}
            <div className="w-[100px] shrink-0">
              <PreviewCard
                title="ほかのスタイル"
                thumbnailUrl={null}
                badge={null}
                avatarUrl={null}
                dimmed
              />
            </div>
            <div className="w-[100px] shrink-0">
              <PreviewCard
                title="ほかのスタイル"
                thumbnailUrl={null}
                badge={null}
                avatarUrl={null}
                dimmed
              />
            </div>
          </div>

          {/* セクション2: マイキャラ選択(My Character | Style の2カラム。Style 側に選択スタイル=サムネを反映) */}
          <p className="mt-3 px-0.5 text-[11px] font-semibold text-gray-900">
            マイキャラ選択
          </p>
          <p className="mb-1.5 px-0.5 text-[8px] leading-tight text-gray-400">
            うちの子の画像をアップロードしてください
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <div className="grid grid-cols-2 gap-1.5">
              {/* My Character(アップロード枠) */}
              <div>
                <p className="mb-0.5 text-[8px] font-medium text-gray-700">
                  My Character
                </p>
                <div className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                  <span className="text-[12px] leading-none">⬆</span>
                  <span className="mt-0.5 text-[7px]">画像を追加</span>
                </div>
              </div>
              {/* Style(選択中スタイル=申請者のサムネを反映) */}
              <div>
                <p className="mb-0.5 text-[8px] font-medium text-gray-700">
                  Style
                </p>
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100">
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt="選択中スタイル"
                      fill
                      sizes="80px"
                      className="object-cover object-top"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[7px] text-gray-400">
                      スタイル
                    </div>
                  )}
                  {/* 提供者クレジット(実機どおり Style 画像に重ねる。アイコン+名前のピル) */}
                  {thumbnailUrl && creditNickname ? (
                    <span className="absolute bottom-1 left-1/2 inline-flex max-w-[90%] -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/55 px-1 py-[1px] text-[7px] font-semibold leading-tight text-white shadow-sm backdrop-blur-[1px]">
                      {avatarUrl ? (
                        <span className="relative h-2.5 w-2.5 shrink-0 overflow-hidden rounded-full">
                          <Image
                            src={avatarUrl}
                            alt=""
                            fill
                            sizes="10px"
                            className="object-cover"
                            unoptimized
                          />
                        </span>
                      ) : null}
                      <span className="truncate">{creditNickname}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-1 rounded-md border border-gray-200 py-1 text-center text-[7px] text-gray-500">
              生成済み/ストックから選ぶ
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
    </>
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

      {/* 下部バー: [アイコン][タイトル]。タイトルは最大2行まで折り返して約18字まで見せる */}
      <div className="flex items-start gap-1 border-t bg-white px-1.5 py-1.5">
        {highlighted ? (
          avatarUrl ? (
            <span className="relative mt-0.5 h-4 w-4 shrink-0 overflow-hidden rounded-full bg-gray-200">
              <Image
                src={avatarUrl}
                alt="申請者"
                fill
                sizes="16px"
                className="object-cover"
                unoptimized
              />
            </span>
          ) : (
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-amber-300" />
          )
        ) : null}
        <p className="line-clamp-2 break-words text-[10px] font-medium leading-tight text-gray-800">
          {title}
        </p>
      </div>
    </div>
  );
}
