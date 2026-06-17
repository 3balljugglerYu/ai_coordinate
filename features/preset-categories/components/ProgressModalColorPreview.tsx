"use client";

import { AchievementBadge } from "@/features/collections/components/AchievementBadge";

/**
 * 進捗モーダルの「進捗リング + %達成バッジ」を、admin が選んだ配色で
 * 静的にプレビューする小さなコンポーネント(約 150px 角)。
 * フレーム画像は使わず、中性的な背景の上にリングとバッジだけを描くので
 * 色の見え方が分かりやすい。form state を直接受け取るためライブ更新される。
 */

// 進捗リング(SVG)の定数。モーダル本体(CollectionProgressModal)と同値。
const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R;
// プレビューのサンプル達成率(見栄え用に 66%)。
const SAMPLE_RATIO = 0.66;

export function ProgressModalColorPreview({
  ringColor,
  badgeColor,
  badgeTextColor,
  badgeBgColor,
  buttonColor,
  buttonTextColor,
}: {
  ringColor: string | null;
  badgeColor: string | null;
  badgeTextColor: string | null;
  badgeBgColor: string | null;
  buttonColor: string | null;
  buttonTextColor: string | null;
}) {
  const dashoffset = RING_C * (1 - SAMPLE_RATIO);
  return (
    <div className="flex flex-col items-center gap-2">
    <div className="relative h-[150px] w-[150px] rounded-xl bg-slate-100">
      {/* 中央画像のプレースホルダ(薄いグレーの円) */}
      <div className="absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300/60" />

      {/* 進捗リング(トラック + アーク)。モーダルと同じ -90° 回転 + dash 計算。 */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full -rotate-90 drop-shadow-[0_1px_2px_rgba(180,90,20,0.35)]"
        aria-hidden
      >
        <defs>
          <linearGradient
            id="previewArc"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
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
          stroke={ringColor ?? "url(#previewArc)"}
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={dashoffset}
        />
      </svg>

      {/* %達成バッジ(リング右下)。静的プレビューなのでアニメは無効。 */}
      <div className="pointer-events-none absolute bottom-1 right-1 h-[40%] w-[40%]">
        <AchievementBadge
          percent={Math.round(SAMPLE_RATIO * 100)}
          color={badgeColor}
          textColor={badgeTextColor}
          bgColor={badgeBgColor}
          animate={false}
        />
      </div>
    </div>

    {/* CTA ボタンのプレビュー(モーダル本体と同じ配色ロジック)。
        塗り色未設定なら従来のオレンジグラデーション、文字色未設定なら白。 */}
    <div
      className={
        "flex w-[150px] items-center justify-center rounded-full px-3 py-2 text-sm font-bold" +
        (buttonColor
          ? ""
          : " bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_4px_0_rgba(234,88,12,0.45)]")
      }
      style={{
        color: buttonTextColor ?? "#ffffff",
        fontFamily: "'Mochiy Pop One','Zen Maru Gothic',system-ui,sans-serif",
        ...(buttonColor ? { backgroundColor: buttonColor } : {}),
      }}
    >
      カードを作成する →
    </div>
    </div>
  );
}
