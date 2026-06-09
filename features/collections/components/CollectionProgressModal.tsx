"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CollectionCelebration {
  categoryKey: string;
  displayName: string;
  /** アニメーション開始値(前回ackの種類数) */
  fromCount: number;
  /** アニメーション到達値(現在の種類数) */
  toCount: number;
  threshold: number;
  isCompleted: boolean;
  mountImageUrl: string | null;
  sharePath: string | null;
  /** 公開ページ token(= collection_completions.id)。シェアに使う */
  completionId: string | null;
  /** リング中央のシリーズ用キャラ画像(任意) */
  characterImageUrl: string | null;
  /** 集めたシール画像(衣装ごと最新1枚)の公開URL。?枠に重ねる */
  collectedImageUrls: string[];
}

interface Props {
  open: boolean;
  celebration: CollectionCelebration | null;
  onClose: () => void;
  /** シェアボタン押下(公開ページURLのシェア)。 */
  onShare?: (celebration: CollectionCelebration) => void;
}

/**
 * シリーズごとのモーダル土台画像(タイトル・ホロ円・?枠・生成ボタンが描かれた PNG)。
 * この画像の上に「進捗リング(アニメ)」と「集めたシール(?枠に重ねる)」を重畳する。
 * 画像は public/ 配下。未登録シリーズは簡易レイアウトにフォールバック。
 */
const FRAME_BY_KEY: Record<string, string> = {
  collectible_wafer_sticker: "/collections/wafer/modal-frame.png",
};
const FRAME_ASPECT = 1086 / 1448; // 土台画像のアスペクト比(W/H)

// 土台画像内の各要素の位置(PIL で金枠を円フィット実測。% は土台コンテナに対する割合)
// 金枠の輪: 中心 (49.82%, 43.82%)。admin 画像(DISC)と進捗リング(RING)は
// 「同一中心・同一半径」で置くため、リングは常に admin 画像の縁にぴったり乗る。
// 半径は焼き込みの金枠を覆える 30.3%W にする(下の絵が外にはみ出さない)。
const DISC = { left: 19.52, top: 21.09, size: 60.6 }; // 中央画像のbbox(径=30.3%W)
// 進捗リング: arc半径(=r47 × size/100)が 30.3%W になるよう size を逆算(30.3/0.47)。
const RING = { left: 17.59, top: 19.64, size: 64.47 }; // 進捗リングのbbox(正方・px)。size は幅%
const SLOT_CX = [23.9, 41.21, 57.69, 75.46]; // ?枠の中心x(%)
const SLOT_CY = 75.1; // ?枠の中心y(%)
const SLOT_D = 14.0; // シールの直径(幅%)。?枠を覆うサイズ
const BUTTON = { left: 7.9, top: 83.8, width: 84.2, height: 10.8 }; // 生成ボタン領域(%)

// 進捗リング(SVG)の定数
const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R;

export function CollectionProgressModal({
  open,
  celebration,
  onClose,
  onShare,
}: Props) {
  // リングは fromCount から toCount へアニメーションさせる。
  // 親が celebration ごとに key を変えて再マウントするため、初期値=fromCount で開始し、
  // effect 内では timeout(非同期)でのみ toCount へ更新する(同期 setState を避ける)。
  const [animatedCount, setAnimatedCount] = useState(
    celebration?.fromCount ?? 0,
  );

  useEffect(() => {
    if (!open || !celebration) return;
    const id = window.setTimeout(() => {
      setAnimatedCount(celebration.toCount);
    }, 80);
    return () => window.clearTimeout(id);
  }, [open, celebration]);

  if (!celebration) return null;

  const {
    categoryKey,
    displayName,
    toCount,
    threshold,
    isCompleted,
    mountImageUrl,
    characterImageUrl,
    collectedImageUrls,
  } = celebration;
  const ratio = threshold > 0 ? Math.min(1, animatedCount / threshold) : 0;
  const dashoffset = RING_C * (1 - ratio);
  const showMount = isCompleted && !!mountImageUrl;
  const frame = FRAME_BY_KEY[categoryKey] ?? null;

  // シールは正方形。幅%(=SLOT_D, コンテナ幅基準)を高さ%(コンテナ高さ基準)へ換算する。
  // 正方になるよう height% = SLOT_D × (W/H) = SLOT_D × FRAME_ASPECT。
  const slotHeightPct = SLOT_D * FRAME_ASPECT;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className={
          showMount || !frame
            ? "w-[min(92vw,420px)] overflow-hidden rounded-3xl border-0 bg-gradient-to-b from-[#FFFaf2] to-white p-5 shadow-2xl"
            : "w-[min(88vw,380px)] border-0 bg-transparent p-0 shadow-none"
        }
      >
        {/* a11y 用タイトル */}
        <DialogTitle className="sr-only">
          {showMount ? "コンプリート！" : `${displayName} コレクション`}
        </DialogTitle>

        {/* 閉じる */}
        <DialogClose className="absolute right-2 top-2 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-400 shadow-md transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
            className="h-4 w-4"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="sr-only">閉じる</span>
        </DialogClose>

        {showMount ? (
          /* ===== 完成: 台紙を表示 ===== */
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-bold text-amber-500">コンプリート！</h2>
            <div className="relative mx-auto aspect-[525/612] w-56 overflow-hidden rounded-2xl border border-amber-100 shadow-[0_6px_18px_rgba(120,90,50,0.18)]">
              <Image
                src={mountImageUrl}
                alt={`${displayName} コンプリート台紙`}
                fill
                sizes="224px"
                className="object-cover"
              />
            </div>
            {onShare ? (
              <button
                type="button"
                onClick={() => onShare(celebration)}
                className="w-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-base font-bold text-white shadow-[0_4px_0_rgba(234,88,12,0.4)] transition-transform hover:-translate-y-0.5"
              >
                台紙をシェアする
              </button>
            ) : null}
            <Link
              href="/collections/wafer"
              className="inline-block text-sm font-medium text-pink-400 hover:text-pink-500"
            >
              遊び方をみる ›
            </Link>
          </div>
        ) : frame ? (
          /* ===== 進捗: 土台PNG + リング + シール重畳 ===== */
          <div
            className="relative w-full overflow-hidden rounded-[1.4rem]"
            style={{ aspectRatio: `${FRAME_ASPECT}` }}
          >
            <Image
              src={frame}
              alt=""
              fill
              sizes="380px"
              priority
              className="object-contain"
            />

            {/* 中央: admin 設定画像で円を塗りつぶし(焼き込みキャラを隠す) */}
            {characterImageUrl ? (
              <div
                className="absolute overflow-hidden rounded-full"
                style={{
                  left: `${DISC.left}%`,
                  top: `${DISC.top}%`,
                  width: `${DISC.size}%`,
                  aspectRatio: "1 / 1",
                }}
              >
                <Image
                  src={characterImageUrl}
                  alt=""
                  fill
                  sizes="320px"
                  className="object-cover"
                />
              </div>
            ) : null}

            {/* 進捗リング(円の縁に重ねる・枠だけアニメ) */}
            <div
              className="absolute"
              style={{
                left: `${RING.left}%`,
                top: `${RING.top}%`,
                width: `${RING.size}%`,
                aspectRatio: "1 / 1",
              }}
            >
              <svg
                viewBox="0 0 100 100"
                className="h-full w-full -rotate-90 drop-shadow-[0_1px_2px_rgba(180,90,20,0.35)]"
              >
                <defs>
                  <linearGradient id="collArc" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#F97316" />
                  </linearGradient>
                </defs>
                {/* トラック(うっすら) */}
                <circle
                  cx="50"
                  cy="50"
                  r={RING_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth="3.2"
                />
                {/* 進捗アーク */}
                <circle
                  cx="50"
                  cy="50"
                  r={RING_R}
                  fill="none"
                  stroke="url(#collArc)"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={dashoffset}
                  className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
                />
              </svg>
            </div>

            {/* 集めたシール(?枠に重ねる) */}
            {SLOT_CX.map((cx, i) => {
              const url = collectedImageUrls[i];
              if (!url) return null;
              return (
                <div
                  key={i}
                  className="absolute overflow-hidden rounded-full border-2 border-white shadow-[0_2px_6px_rgba(120,90,50,0.25)]"
                  style={{
                    left: `${cx - SLOT_D / 2}%`,
                    top: `${SLOT_CY - slotHeightPct / 2}%`,
                    width: `${SLOT_D}%`,
                    aspectRatio: "1 / 1",
                  }}
                >
                  <Image src={url} alt="" fill sizes="56px" className="object-cover" />
                </div>
              );
            })}

            {/* 生成ボタン(透明クリック領域) */}
            <Link
              href="/style"
              aria-label="シールを生成する"
              className="absolute rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
              style={{
                left: `${BUTTON.left}%`,
                top: `${BUTTON.top}%`,
                width: `${BUTTON.width}%`,
                height: `${BUTTON.height}%`,
              }}
            />
          </div>
        ) : (
          /* ===== フォールバック(土台画像未登録シリーズ) ===== */
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-bold text-[#4a3b2c]">
              {displayName} コレクション
            </h2>
            <p className="text-sm text-[#7a6a58]">
              {toCount} / {threshold} 種 集めたよ！
            </p>
            <Link
              href="/style"
              className="inline-block w-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-base font-bold text-white shadow-[0_4px_0_rgba(234,88,12,0.4)]"
            >
              シールを生成する
            </Link>
            <Link
              href="/collections/wafer"
              className="inline-block text-sm font-medium text-pink-400 hover:text-pink-500"
            >
              遊び方をみる ›
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
