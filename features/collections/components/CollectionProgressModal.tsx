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
  /** N種到達かつ台紙未作成のとき「台紙を作成する」ボタン押下で呼ばれる */
  onCreateMount?: (celebration: CollectionCelebration) => void;
}

/**
 * カテゴリごとのモーダルレイアウト定義。
 * - 土台 PNG (frame)・アスペクト比 (frameAspect)
 * - 中央 admin 画像(DISC)・進捗リング(RING)の bbox
 * - スロット(集めたシール)の中心 x 配列・中心 y・直径
 * - 「シールを生成する」ボタンの透明領域
 * - %達成バッジの位置
 *
 * スロット座標を配列で持つので、4個用 PNG と 6個用 PNG をそれぞれ用意し
 * カテゴリごとに切替できる。slots.cx.length より多い「集めたシール」は
 * 表示されないが ready ゲートも打ち切るためデッドロックしない。
 * 未登録カテゴリは PNG なしの簡易レイアウトにフォールバック。
 */
interface ModalLayout {
  frame: string;
  frameAspect: number;
  disc: { left: number; top: number; size: number };
  ring: { left: number; top: number; size: number };
  badge: { cx: number; cy: number; size: number };
  button: { left: number; top: number; width: number; height: number };
  slots: { cx: number[]; cy: number; d: number };
}

const MODAL_LAYOUTS: Record<string, ModalLayout> = {
  // ウエハース(4スロット)
  collectible_wafer_sticker: {
    frame: "/collections/wafer/modal-frame.webp",
    frameAspect: 1086 / 1448,
    // 金枠の輪: 中心 (49.82%, 43.82%)、半径 30.3%(W)
    disc: { left: 19.52, top: 21.09, size: 60.6 },
    ring: { left: 17.59, top: 19.64, size: 64.47 },
    badge: { cx: 73.0, cy: 60.5, size: 26.0 },
    button: { left: 7.9, top: 83.8, width: 84.2, height: 10.8 },
    slots: { cx: [23.9, 41.21, 57.69, 75.46], cy: 75.1, d: 14.0 },
  },
  // ※6スロット用カテゴリは別途、6個 ?枠が描かれた土台 PNG を用意し
  //   ここに同じ形式で追加する。例:
  // collectible_wafer_sticker_6: {
  //   frame: "/collections/wafer/modal-frame-6.webp",
  //   ...
  //   slots: { cx: [<6個の中心x>], cy: ..., d: ... },
  // },
};

// 進捗リング(SVG)の定数
const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R;

/**
 * スカロップ(波打ち)型のゴールドバッジ + 王冠 + 「○○%／達成！」を描く SVG。
 * 画像素材を持たずインラインで完結し、画面幅に応じて拡縮しても崩れない。
 */
function AchievementBadge({ percent }: { percent: number }) {
  // 10弁のスカロップを極座標で生成(内/外を交互に)
  const cx = 50;
  const cy = 50;
  const petals = 10;
  const rOuter = 44;
  const rInner = 38;
  const pts: string[] = [];
  for (let i = 0; i < petals * 2; i++) {
    const a = (i * Math.PI) / petals - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full drop-shadow-[0_2px_4px_rgba(180,90,20,0.35)]"
      aria-hidden
    >
      <defs>
        <radialGradient id="badgeFill" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="70%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#FDE68A" />
        </radialGradient>
        <linearGradient id="badgeStroke" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* 外側スカロップ(濃ゴールド) */}
      <polygon
        points={pts.join(" ")}
        fill="url(#badgeStroke)"
      />
      {/* 内側スカロップ(中身)。やや小さい同形で重ねて縁取りを作る */}
      <polygon
        points={pts
          .map((p) => {
            const [x, y] = p.split(",").map(Number);
            return `${(cx + (x - cx) * 0.86).toFixed(2)},${(cy + (y - cy) * 0.86).toFixed(2)}`;
          })
          .join(" ")}
        fill="url(#badgeFill)"
      />
      {/* 王冠(シンプル) - %が真ん中にくるよう下にシフト */}
      <g transform="translate(50 31)">
        <path
          d="M -7 6 L -7 -1 L -3 3 L 0 -4 L 3 3 L 7 -1 L 7 6 Z"
          fill="#F59E0B"
          stroke="#FFFFFF"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        <circle cx="-7" cy="-1" r="1.2" fill="#F59E0B" />
        <circle cx="0" cy="-4" r="1.3" fill="#F59E0B" />
        <circle cx="7" cy="-1" r="1.2" fill="#F59E0B" />
      </g>
      {/* 「○○%」(オレンジ・大きめ) - バッジ中央に配置
            カウントアップ後半でぴょこっと拡縮(coll-pop)。SVG <text> は
            transform-box=fill-box で自身の中心を回転原点にできる。 */}
      <text
        x="50"
        y="57"
        textAnchor="middle"
        fontFamily="'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif"
        fontWeight="700"
        fontSize="20"
        fill="#F97316"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animation: "coll-pop 1400ms ease-out both",
        }}
      >
        {percent}%
      </text>
      {/* 「達成！」 - %の直下 */}
      <text
        x="50"
        y="69"
        textAnchor="middle"
        fontFamily="'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif"
        fontWeight="700"
        fontSize="9"
        fill="#B45309"
      >
        達成！
      </text>
    </svg>
  );
}

export function CollectionProgressModal({
  open,
  celebration,
  onClose,
  onShare,
  onCreateMount,
}: Props) {
  // リングと %バッジは fromCount → toCount を rAF で滑らかにアニメさせる。
  // 親が celebration ごとに key を変えて再マウントするため、初期値=fromCount で開始し、
  // effect 内で requestAnimationFrame を回して animatedCount を非同期に更新する。
  const [animatedCount, setAnimatedCount] = useState(
    celebration?.fromCount ?? 0,
  );

  // すべての画像 (土台/中央/各シール/台紙) のロードが終わってからアニメ開始。
  // アニメだけ走って画像が後から出る現象を避ける。Image の onLoad で加算し、
  // 必要枚数に到達したら ready=true。
  const [loadedCount, setLoadedCount] = useState(0);
  const onImgLoad = () => setLoadedCount((c) => c + 1);

  // ready を effect の deps に入れるため、useEffect より前で算出する(null-safe)。
  const cIsCompleted = celebration?.isCompleted ?? false;
  const cMountImageUrl = celebration?.mountImageUrl ?? null;
  const cCharacterImageUrl = celebration?.characterImageUrl ?? null;
  const cCollectedImageUrls = celebration?.collectedImageUrls ?? [];
  const cShowMount = cIsCompleted && !!cMountImageUrl;
  const cLayout = celebration
    ? (MODAL_LAYOUTS[celebration.categoryKey] ?? null)
    : null;
  // ready ゲートはスロット数で打ち切る。集めたシールがスロット数より多い場合
  // (=例: 4スロット PNG に対し threshold=6 で 6枚集まった等)に、表示されない
  // シールの onLoad を待ち続けてデッドロックするのを防ぐ。
  const cSlotsShown = cLayout
    ? Math.min(cCollectedImageUrls.length, cLayout.slots.cx.length)
    : 0;
  const totalImages = !celebration
    ? 0
    : cShowMount
      ? cMountImageUrl
        ? 1
        : 0
      : cLayout
        ? 1 + (cCharacterImageUrl ? 1 : 0) + cSlotsShown
        : 0;
  const ready = totalImages === 0 || loadedCount >= totalImages;

  // ready (全画像ロード完了) を gate にして rAF を開始する。
  // 親が key で再マウントするので state は再初期化される。
  useEffect(() => {
    if (!open || !celebration || !ready) return;
    const from = celebration.fromCount;
    const to = celebration.toCount;
    // 即値で揃えるべきケース(同値 or モーション低減)はマイクロタスクで切替し、
    // effect 中の同期 setState(cascading render) を避ける。
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from === to || reduce) {
      let canceled = false;
      queueMicrotask(() => {
        if (!canceled) setAnimatedCount(to);
      });
      return () => {
        canceled = true;
      };
    }
    const duration = 1100; // ms
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    let startTs: number | null = null;
    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const t = Math.min(1, (now - startTs) / duration);
      setAnimatedCount(from + (to - from) * easeOut(t));
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [open, celebration, ready]);

  if (!celebration) return null;

  const { displayName, toCount, threshold } = celebration;
  const mountImageUrl = cMountImageUrl;
  const characterImageUrl = cCharacterImageUrl;
  const collectedImageUrls = cCollectedImageUrls;
  const showMount = cShowMount;
  const layout = cLayout;
  const ratio = threshold > 0 ? Math.min(1, animatedCount / threshold) : 0;
  const dashoffset = RING_C * (1 - ratio);

  // シールは正方形。幅%(=slots.d, コンテナ幅基準)を高さ%(コンテナ高さ基準)へ換算する。
  // 正方になるよう height% = slots.d × (W/H) = slots.d × frameAspect。
  const slotHeightPct = layout ? layout.slots.d * layout.frameAspect : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className={
          showMount || !layout
            ? "w-[min(92vw,420px)] overflow-hidden rounded-3xl border-0 bg-gradient-to-b from-[#FFFaf2] to-white p-5 shadow-2xl"
            : "w-[min(88vw,380px)] border-0 bg-transparent p-0 shadow-none"
        }
      >
        <style>{`
          @keyframes coll-pop {
            0%, 70% { transform: scale(1); }
            82% { transform: scale(1.24); }
            92% { transform: scale(0.96); }
            100% { transform: scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes coll-pop { from,to { transform: scale(1); } }
          }
        `}</style>

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

        {/* すべての画像のロード完了まで opacity:0。
              アニメ(rAF)もこのフラグで開始を gate しているため、
              絵とアニメが同時に開始される。 */}
        <div
          style={{
            opacity: ready ? 1 : 0,
            transition: "opacity 220ms ease-out",
          }}
        >
        {showMount ? (
          /* ===== 完成: 台紙を表示 ===== */
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-bold text-amber-500">コンプリート！</h2>
            <div className="relative mx-auto aspect-[525/612] w-56 overflow-hidden rounded-2xl border border-amber-100 shadow-[0_6px_18px_rgba(120,90,50,0.18)]">
              <Image
                src={mountImageUrl ?? ""}
                alt={`${displayName} コンプリート台紙`}
                fill
                sizes="224px"
                className="object-cover"
                onLoad={onImgLoad}
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
        ) : layout ? (
          /* ===== 進捗: 土台PNG + リング + シール重畳 ===== */
          <div
            className="relative w-full overflow-hidden rounded-[1.4rem]"
            style={{ aspectRatio: `${layout.frameAspect}` }}
          >
            <Image
              src={layout.frame}
              alt=""
              fill
              sizes="380px"
              priority
              className="object-contain"
              onLoad={onImgLoad}
            />

            {/* 中央: admin 設定画像で円を塗りつぶし(焼き込みキャラを隠す) */}
            {characterImageUrl ? (
              <div
                className="absolute overflow-hidden rounded-full"
                style={{
                  left: `${layout.disc.left}%`,
                  top: `${layout.disc.top}%`,
                  width: `${layout.disc.size}%`,
                  aspectRatio: "1 / 1",
                }}
              >
                <Image
                  src={characterImageUrl}
                  alt=""
                  fill
                  sizes="320px"
                  className="object-cover"
                  onLoad={onImgLoad}
                />
              </div>
            ) : null}

            {/* 進捗リング(円の縁に重ねる・枠だけアニメ) */}
            <div
              className="absolute"
              style={{
                left: `${layout.ring.left}%`,
                top: `${layout.ring.top}%`,
                width: `${layout.ring.size}%`,
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
                  className="transition-none motion-reduce:transition-none"
                />
              </svg>
            </div>

            {/* %達成バッジ(リング右下) */}
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${layout.badge.cx - layout.badge.size / 2}%`,
                top: `${layout.badge.cy - (layout.badge.size * layout.frameAspect) / 2}%`,
                width: `${layout.badge.size}%`,
                aspectRatio: "1 / 1",
              }}
            >
              <AchievementBadge percent={Math.round(ratio * 100)} />
            </div>

            {/* 集めたシール(?枠に重ねる)。slots.cx 上限まで。それ以上の集まりは表示しない。 */}
            {layout.slots.cx.map((cx, i) => {
              const url = collectedImageUrls[i];
              if (!url) return null;
              return (
                <div
                  key={i}
                  className="absolute overflow-hidden rounded-full border-2 border-white shadow-[0_2px_6px_rgba(120,90,50,0.25)]"
                  style={{
                    left: `${cx - layout.slots.d / 2}%`,
                    top: `${layout.slots.cy - slotHeightPct / 2}%`,
                    width: `${layout.slots.d}%`,
                    aspectRatio: "1 / 1",
                  }}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                    onLoad={onImgLoad}
                  />
                </div>
              );
            })}

            {/* N種到達かつ台紙未作成 → 「台紙を作成する」CTA を土台の生成ボタン領域に
                  かぶせる(土台PNGの「シールを生成する」を覆い隠す)。
                それ以外は透明クリック領域で /style へ遷移。 */}
            {toCount >= threshold && !cIsCompleted && onCreateMount ? (
              <button
                type="button"
                onClick={() => onCreateMount(celebration)}
                className="absolute flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-base font-bold text-white shadow-[0_4px_0_rgba(234,88,12,0.45)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
                style={{
                  left: `${layout.button.left}%`,
                  top: `${layout.button.top}%`,
                  width: `${layout.button.width}%`,
                  height: `${layout.button.height}%`,
                  fontFamily: "'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif",
                }}
              >
                台紙を作成する →
              </button>
            ) : (
              <Link
                href="/style"
                aria-label="シールを生成する"
                className="absolute rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
                style={{
                  left: `${layout.button.left}%`,
                  top: `${layout.button.top}%`,
                  width: `${layout.button.width}%`,
                  height: `${layout.button.height}%`,
                }}
              />
            )}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
