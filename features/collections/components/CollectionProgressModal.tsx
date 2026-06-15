"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { CollectionConfetti } from "@/features/collections/components/CollectionConfetti";
import { CollectionSparkle } from "@/features/collections/components/CollectionSparkle";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";
import type { NormalizedSlotRect } from "@/features/collections/lib/mount-layouts";
import { MOUNT_SHARE_MESSAGES } from "@/features/collections/lib/mount-share-messages";
import {
  buildPublicMountUrl,
  trackMountShareEvent,
} from "@/features/collections/lib/share-mount";

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
  /** 台紙テンプレ実寸(px)。表示アスペクト算出用。無ければ null(従来表にフォールバック) */
  mountTemplateWidth?: number | null;
  mountTemplateHeight?: number | null;
  sharePath: string | null;
  /** 公開ページ token(= collection_completions.id)。シェアに使う */
  completionId: string | null;
  /** リング中央のシリーズ用キャラ画像(任意) */
  characterImageUrl: string | null;
  /** 集めたシール画像(衣装ごと最新1枚)の公開URL。?枠に重ねる */
  collectedImageUrls: string[];
  /**
   * 完了ビューに「台紙を更新する」を出すか(任意)。
   * いずれかの衣装で2枚以上生成済み(=選び直す余地がある)のときだけ true を渡す。
   */
  canRecompose?: boolean;
  /**
   * モーダル表示時の演出種別(任意・デフォルト "confetti")。
   * - "confetti": 左右からクラッカー風の紙吹雪(初コンプの祝い)
   * - "sparkle": ダイヤのきらめき(完了台紙の見返しなど落ち着いた場面)
   */
  celebrationEffect?: "confetti" | "sparkle";
  /**
   * 進捗モーダルの DB 駆動レイアウト(admin がカテゴリごとに設定)。
   * progressModalFrameUrl が設定されているときは MODAL_LAYOUTS より優先して描画する。
   * 未設定(null)なら従来どおりハードコード MODAL_LAYOUTS にフォールバック。
   */
  progressModalFrameUrl?: string | null;
  progressModalFrameWidth?: number | null;
  progressModalFrameHeight?: number | null;
  progressModalSlots?: NormalizedSlotRect[] | null;
  progressModalButton?: NormalizedSlotRect | null;
}

interface Props {
  open: boolean;
  celebration: CollectionCelebration | null;
  onClose: () => void;
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
  // disc(中央キャラ円)・ring(進捗リング)・badge(%達成)は台座デザインにより
  // 持たないことがある(例: ぷち神は中央が四角フレームでリング/バッジ無し)。任意。
  disc?: { left: number; top: number; size: number };
  ring?: { left: number; top: number; size: number };
  badge?: { cx: number; cy: number; size: number };
  button: { left: number; top: number; width: number; height: number };
  slots: { cx: number[]; cy: number; d: number };
  /**
   * DB 駆動レイアウト用のスロット矩形(正規化 0..1)。
   * 設定があるときは slots(cx/cy/d)より優先して描画する。
   */
  slotRects?: NormalizedSlotRect[];
  /**
   * DB 駆動レイアウト用のボタン領域(正規化 0..1)。
   * 設定があるときは button(%)より優先して描画する。
   */
  buttonRect?: NormalizedSlotRect | null;
}

// ready(全画像ロード完了)の保険タイムアウト。これを過ぎたら強制表示する。
const READY_TIMEOUT_MS = 3500;

// 紙吹雪(confetti)の発火フォールバック。台紙画像のロード(ready)を待たずに、
// モーダルが開いたらこの時間以内に必ず発火させる(初回コンプリートの取りこぼし対策)。
const CONFETTI_FALLBACK_MS = 600;

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
  // ウエハース 神コレクション(6スロット)。modal-frame-6.webp (1085x1449) 実測。
  // 金リング: 中心 (49.77%, 44.24%)、直径 62.2%(W)
  // ※key は admin で作成する 6枠カテゴリの key と一致させること。
  collectible_wafer_sticker_god_6p: {
    frame: "/collections/wafer/modal-frame-6.webp",
    frameAspect: 1085 / 1449,
    disc: { left: 18.66, top: 20.94, size: 62.21 },
    ring: { left: 16.68, top: 19.46, size: 66.18 },
    badge: { cx: 73.1, cy: 61.7, size: 26.0 },
    button: { left: 8.1, top: 84.5, width: 84.2, height: 10.8 },
    // ?円(直径12.3%)をわずかに覆うサイズ。シールを大きく見せる(縁はほぼ消える)
    slots: { cx: [11.66, 27.05, 42.07, 57.28, 72.3, 87.42], cy: 75.67, d: 13.0 },
  },
  // ぷち神コレクション(6スロット)。専用台座 modal-frame-petit-6.webp (1086x1448) 実測。
  // 中央は四角い「限定フレーム」のため、丸キャラ disc・進捗リング・%バッジは持たない
  // (= 進捗は下段スロットの埋まりで表現)。スロット中心は画像解析で実測した値。
  collectible_wafer_sticker_god_petit_6p: {
    frame: "/collections/wafer/modal-frame-petit-6.webp",
    frameAspect: 1086 / 1448,
    button: { left: 10.5, top: 85.5, width: 79.0, height: 8.5 },
    slots: { cx: [13.2, 26.6, 42.0, 57.3, 72.8, 85.9], cy: 78.0, d: 13.3 },
  },
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
  // onError も加算する: 1枚でも読み込みに失敗すると ready が永遠に立たず
  // モーダルが透明のまま(オーバーレイだけ)になるデッドロックを防ぐ。
  const [loadedCount, setLoadedCount] = useState(0);
  const onImgLoad = () => setLoadedCount((c) => c + 1);
  // ready の保険。画像の onLoad/onError が何らかの理由で発火しない場合
  // (モバイルのキャッシュ済み画像で onLoad が来ない等)に、モーダルが
  // 「準備中…」のまま見えなくなるのを防ぐ。一定時間で強制的に ready にする。
  // celebration ごとに key で再マウントされるため state はリセットされる。
  const [forceReady, setForceReady] = useState(false);
  // 紙吹雪を発火してよいか。台紙画像のロードを待たず、モーダルが出たら発火する。
  const [confettiArmed, setConfettiArmed] = useState(false);

  // ready を effect の deps に入れるため、useEffect より前で算出する(null-safe)。
  const cIsCompleted = celebration?.isCompleted ?? false;
  const cEffect = celebration?.celebrationEffect ?? "confetti";
  const cMountImageUrl = celebration?.mountImageUrl ?? null;
  const cCharacterImageUrl = celebration?.characterImageUrl ?? null;
  const cCollectedImageUrls = celebration?.collectedImageUrls ?? [];
  const cShowMount = cIsCompleted && !!cMountImageUrl;
  // admin がカテゴリごとに設定した DB 駆動レイアウト。フレーム画像+実寸がそろっている
  // ときだけ有効。設定が無ければ従来どおりハードコード MODAL_LAYOUTS を使う。
  const dbLayout: ModalLayout | null =
    celebration &&
    celebration.progressModalFrameUrl &&
    celebration.progressModalFrameWidth &&
    celebration.progressModalFrameHeight
      ? {
          frame: celebration.progressModalFrameUrl,
          frameAspect:
            celebration.progressModalFrameWidth /
            celebration.progressModalFrameHeight,
          button: { left: 0, top: 0, width: 0, height: 0 },
          slots: { cx: [], cy: 0, d: 0 },
          slotRects: celebration.progressModalSlots ?? [],
          buttonRect: celebration.progressModalButton ?? null,
        }
      : null;
  const cLayout = celebration
    ? (dbLayout ?? MODAL_LAYOUTS[celebration.categoryKey] ?? null)
    : null;
  // DB 駆動レイアウト(slotRects)のときは矩形配列の長さ、従来は slots.cx の長さで
  // 「描画されるシール枠数」を決める。
  const cSlotCount = cLayout
    ? cLayout.slotRects
      ? cLayout.slotRects.length
      : cLayout.slots.cx.length
    : 0;
  // ready ゲートは「実際に描画されるシール枚数」で数える。
  // シールは下の map で url が無いスロット(!url)を描画しないため、totalImages を
  // collectedImageUrls.length で数えると、欠け(null/空)があるとき描画 < 期待となり
  // loadedCount が永遠に届かず ready が立たない(モーダルが準備中のまま見えない)。
  // よって、スロット数で打ち切ったうえで非 null のみを数える。
  const cSlotsShown = cLayout
    ? cCollectedImageUrls.slice(0, cSlotCount).filter(Boolean).length
    : 0;
  const totalImages = !celebration
    ? 0
    : cShowMount
      ? cMountImageUrl
        ? 1
        : 0
      : cLayout
        ? 1 + (cCharacterImageUrl && cLayout.disc ? 1 : 0) + cSlotsShown
        : 0;
  const ready = totalImages === 0 || loadedCount >= totalImages || forceReady;

  // ready 保険: 開いてから一定時間ロードが完了しなければ強制的に表示する。
  // (画像の onLoad/onError が来ないケースでモーダルが見えなくなるのを防ぐ)
  useEffect(() => {
    if (!open || !celebration || ready) return;
    const timer = window.setTimeout(
      () => setForceReady(true),
      READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, celebration, ready]);

  // 紙吹雪の発火: 完了かつ confetti 演出のとき、台紙画像のロード(ready)を待たず、
  // ready なら即・未ロードでも CONFETTI_FALLBACK_MS 以内に必ず armed にする。
  // これで初回コンプリート(台紙画像が未キャッシュで ready が遅い)でも取りこぼさない。
  useEffect(() => {
    if (!open || !celebration || cEffect !== "confetti" || !cIsCompleted) {
      return;
    }
    // ready なら即(次tick)・未ロードでも fallback 以内に発火。
    // 同期 setState(cascading render)を避けるためタイマー経由にする。
    const delay = ready ? 0 : CONFETTI_FALLBACK_MS;
    const timer = window.setTimeout(() => setConfettiArmed(true), delay);
    return () => window.clearTimeout(timer);
  }, [open, celebration, cEffect, cIsCompleted, ready]);

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

  const { displayName, toCount, threshold, completionId } = celebration;
  const effect = celebration.celebrationEffect ?? "confetti";
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

  // ボタン領域(% 指定)。DB 駆動の buttonRect 優先、無ければ従来 button(%)。
  const buttonBox =
    layout && layout.buttonRect
      ? {
          left: layout.buttonRect.x * 100,
          top: layout.buttonRect.y * 100,
          width: layout.buttonRect.w * 100,
          height: layout.buttonRect.h * 100,
        }
      : layout
        ? layout.button
        : { left: 0, top: 0, width: 0, height: 0 };

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
          /* 新しく集まったシールが"ポンッ"と押されるスタンプイン */
          @keyframes coll-stamp-in {
            0%   { transform: scale(0) rotate(-14deg); opacity: 0; }
            55%  { transform: scale(1.2) rotate(5deg); opacity: 1; }
            78%  { transform: scale(0.92) rotate(-2deg); }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }
          /* スタンプ後も並び全体がゆっくり波打つアイドルアニメ(transform のみで軽量) */
          @keyframes coll-wave {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-16%); }
          }
          .coll-stamp-in {
            transform-origin: center;
            animation: coll-stamp-in 600ms cubic-bezier(.2,.7,.3,1.5)
              var(--coll-stamp-delay, 0s) both;
          }
          .coll-wave {
            animation: coll-wave 2.6s ease-in-out
              var(--coll-wave-delay, 0s) infinite;
          }
          /* 完了台紙の背後で放射状に射す後光(オーラ)。ゆっくり回転し、
             外周は mask でフェードして余白を上品に光で満たす。 */
          .coll-aura {
            border-radius: 9999px;
            background: repeating-conic-gradient(
              rgba(253, 224, 71, 0.34) 0deg 6deg,
              transparent 6deg 19deg
            );
            -webkit-mask-image: radial-gradient(circle, #000 16%, transparent 66%);
            mask-image: radial-gradient(circle, #000 16%, transparent 66%);
            transform: translate(-50%, -50%);
            animation: coll-aura-spin 16s linear infinite;
          }
          @keyframes coll-aura-spin {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to   { transform: translate(-50%, -50%) rotate(360deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes coll-pop { from,to { transform: scale(1); } }
            .coll-stamp-in, .coll-wave, .coll-aura { animation: none !important; }
          }
        `}</style>

        {/* モーダル表示のたびの祝い演出(全画像ロード後に発火)。
              - confetti: 左右からクラッカー風の紙吹雪。body 直下の Portal に出すため
                Dialog の overflow には影響されない。
              - sparkle: ダイヤのきらめき(完了台紙の見返し等)。モーダル枠内を彩る。 */}
        {/* confetti(クラッカー)は「初コンプの祝い」専用(完了 + confetti 演出)。
            台紙画像のロード(ready)を待たず confettiArmed で発火するため、初回
            コンプリートでも確実に飛ぶ(armed の条件に完了/演出種別を含む)。 */}
        <CollectionConfetti show={confettiArmed} />
        <CollectionSparkle show={ready && effect === "sparkle"} />

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
              絵とアニメが同時に開始される。ロード中は上にスピナーを重ねる
              (生成直後など画像が未キャッシュだと数秒かかるため)。 */}
        <div className="relative">
        {!ready ? (
          <div
            role="status"
            aria-label="読み込み中"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[1.4rem] bg-white/75"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="h-9 w-9 animate-spin text-amber-500 motion-reduce:animate-none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="3"
              />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm font-medium text-amber-600">準備中…</span>
          </div>
        ) : null}
        <div
          style={{
            opacity: ready ? 1 : 0,
            transition: "opacity 220ms ease-out",
          }}
        >
        {showMount ? (
          /* ===== 完成: 台紙を表示 ===== */
          <div className="space-y-4 text-center">
            <h2 className="relative z-10 text-xl font-bold text-amber-500">
              コンプリート！
            </h2>
            {/* 台紙 + 背後の後光(オーラ)。後光は台紙中心に合わせ、台紙幅より
                大きく広げて左右余白を光で満たす。 */}
            <div className="relative mx-auto w-56">
              <div
                className="coll-aura pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[210%]"
                aria-hidden
              />
              <div
                className="relative overflow-hidden rounded-2xl border border-amber-100 shadow-[0_6px_18px_rgba(120,90,50,0.18)]"
                style={{
                  aspectRatio: mountAspectForCategory(
                    celebration.categoryKey,
                    celebration.mountTemplateWidth,
                    celebration.mountTemplateHeight,
                  ),
                }}
              >
                <Image
                  src={mountImageUrl ?? ""}
                  alt={`${displayName} コンプリート台紙`}
                  fill
                  sizes="224px"
                  className="object-cover"
                  onLoad={onImgLoad}
                  onError={onImgLoad}
                />
              </div>
            </div>
            {completionId ? (
              /* posts / /m と同じ共有 UI(モバイル=シェアシート、PC=コピー/Web Share
                 メニュー)。成功時に share-event を計測する。 */
              <ShareLinkButton
                url={() => buildPublicMountUrl(completionId, mountImageUrl)}
                messages={MOUNT_SHARE_MESSAGES}
                onShared={() => trackMountShareEvent(completionId)}
                className="h-auto w-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-base font-bold text-white shadow-[0_4px_0_rgba(234,88,12,0.4)] transition-transform hover:-translate-y-0.5"
              >
                台紙をシェアする
              </ShareLinkButton>
            ) : null}
            {celebration.sharePath ? (
              <Link
                href={celebration.sharePath}
                className="block w-full rounded-full border-2 border-amber-300 bg-white px-6 py-3 text-base font-bold text-amber-600 transition-colors hover:bg-amber-50"
              >
                シェアページへ
              </Link>
            ) : null}
            {/* 選び直す余地がある(いずれかの衣装で2枚以上生成済み)ときだけ表示 */}
            {celebration.canRecompose && onCreateMount ? (
              <button
                type="button"
                onClick={() => onCreateMount(celebration)}
                className="w-full rounded-full border-2 border-amber-300 bg-white px-6 py-3 text-base font-bold text-amber-600 transition-colors hover:bg-amber-50"
              >
                台紙を更新する
              </button>
            ) : null}
            <Link
              href="/collections/wafer"
              onClick={onClose}
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
              onError={onImgLoad}
            />

            {/* 中央: admin 設定画像で円を塗りつぶし(焼き込みキャラを隠す) */}
            {characterImageUrl && layout.disc ? (
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
                  onError={onImgLoad}
                />
              </div>
            ) : null}

            {/* 進捗リング(円の縁に重ねる・枠だけアニメ)。台座にリング定義があるときだけ描画。 */}
            {layout.ring ? (
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
            ) : null}

            {/* %達成バッジ(リング右下)。台座にバッジ定義があるときだけ描画。 */}
            {layout.badge ? (
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
            ) : null}

            {/* 集めたシール(?枠に重ねる)。
                - DB 駆動(slotRects): admin が設定した矩形にシールを敷き詰める。
                - 従来(slots.cx/cy/d): 中心+直径から正方クリップで配置。
                どちらも slot 上限まで。それ以上の集まりは表示しない。
                外側=波打ち(translateY)・内側=スタンプイン(scale/rotate)と transform を
                分離して両アニメを合成する。今回増えた分だけ"ポンッ"と押す。 */}
            {layout.slotRects
              ? layout.slotRects.map((rect, i) => {
                  const url = collectedImageUrls[i];
                  if (!url) return null;
                  const isNew =
                    i >= celebration.fromCount && i < celebration.toCount;
                  const stampDelay = isNew
                    ? (i - celebration.fromCount) * 0.1
                    : 0;
                  return (
                    <div
                      key={i}
                      className={`absolute ${ready ? "coll-wave" : ""}`}
                      style={
                        {
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.w * 100}%`,
                          height: `${rect.h * 100}%`,
                          "--coll-wave-delay": `${isNew ? stampDelay + 0.62 : i * 0.16}s`,
                          "--coll-stamp-delay": `${stampDelay}s`,
                        } as CSSProperties
                      }
                    >
                      <div
                        className={`h-full w-full overflow-hidden rounded-full border-2 border-white shadow-[0_2px_6px_rgba(120,90,50,0.25)] will-change-transform ${ready && isNew ? "coll-stamp-in" : ""}`}
                      >
                        <Image
                          src={url}
                          alt=""
                          fill
                          sizes="56px"
                          className="rounded-full object-cover"
                          onLoad={onImgLoad}
                          onError={onImgLoad}
                        />
                      </div>
                    </div>
                  );
                })
              : layout.slots.cx.map((cx, i) => {
                  const url = collectedImageUrls[i];
                  if (!url) return null;
                  // fromCount→toCount で今回増えた分が「新規」。複数なら順番にスタンプ。
                  const isNew =
                    i >= celebration.fromCount && i < celebration.toCount;
                  const stampDelay = isNew ? (i - celebration.fromCount) * 0.1 : 0;
                  return (
                    <div
                      key={i}
                      className={`absolute ${ready ? "coll-wave" : ""}`}
                      style={
                        {
                          left: `${cx - layout.slots.d / 2}%`,
                          top: `${layout.slots.cy - slotHeightPct / 2}%`,
                          width: `${layout.slots.d}%`,
                          aspectRatio: "1 / 1",
                          // 波の位相を slot ごとにずらして"波打ち"に。新規はスタンプ着地後に波へ。
                          "--coll-wave-delay": `${isNew ? stampDelay + 0.62 : i * 0.16}s`,
                          "--coll-stamp-delay": `${stampDelay}s`,
                        } as CSSProperties
                      }
                    >
                      <div
                        // WebKit では親(coll-wave)の transform アニメ下で overflow+border-radius の
                        // 丸クリップが初回に崩れ四角に見えることがある。will-change で GPU レイヤー化して
                        // 安定させる(新規枠は coll-stamp-in の transform で昇格済みのため差が出ていた)。
                        // transform を直接占有すると coll-stamp-in の scale/rotate と競合するため will-change を使う。
                        className={`h-full w-full overflow-hidden rounded-full border-2 border-white shadow-[0_2px_6px_rgba(120,90,50,0.25)] will-change-transform ${ready && isNew ? "coll-stamp-in" : ""}`}
                      >
                        <Image
                          src={url}
                          alt=""
                          fill
                          sizes="56px"
                          className="rounded-full object-cover"
                          onLoad={onImgLoad}
                          onError={onImgLoad}
                        />
                      </div>
                    </div>
                  );
                })}

            {/* N種到達かつ台紙未作成 → 「台紙を作成する」CTA を土台の生成ボタン領域に
                  かぶせる(土台PNGの「シールを生成する」を覆い隠す)。
                それ以外は透明クリック領域で /style へ遷移。 */}
            {toCount >= threshold && onCreateMount ? (
              <button
                type="button"
                onClick={() => onCreateMount(celebration)}
                className="absolute flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-base font-bold text-white shadow-[0_4px_0_rgba(234,88,12,0.45)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
                style={{
                  left: `${buttonBox.left}%`,
                  top: `${buttonBox.top}%`,
                  width: `${buttonBox.width}%`,
                  height: `${buttonBox.height}%`,
                  fontFamily: "'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif",
                }}
              >
                {cIsCompleted ? "台紙を更新する →" : "台紙を作成する →"}
              </button>
            ) : (
              <Link
                href="/style"
                aria-label="シールを生成する"
                onClick={onClose}
                className="absolute rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/60"
                style={{
                  left: `${buttonBox.left}%`,
                  top: `${buttonBox.top}%`,
                  width: `${buttonBox.width}%`,
                  height: `${buttonBox.height}%`,
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
              onClick={onClose}
              className="inline-block w-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-base font-bold text-white shadow-[0_4px_0_rgba(234,88,12,0.4)]"
            >
              シールを生成する
            </Link>
            <Link
              href="/collections/wafer"
              onClick={onClose}
              className="inline-block text-sm font-medium text-pink-400 hover:text-pink-500"
            >
              遊び方をみる ›
            </Link>
          </div>
        )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
