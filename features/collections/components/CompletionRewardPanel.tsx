"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { CountUpNumber } from "./CountUpNumber";

/**
 * 完走報酬の獲得演出パネル(docs/planning/collection-completion-reward-implementation-plan.md EARS-09)。
 *
 * 「じらし→カウントアップ→着地ドーン」の3段構成:
 *   delayMs 後にポップイン → 0→amount カウントアップ(1.2s) → 着地でバウンス+コイン粒子バースト。
 *
 * - amount<=0 なら何も描画しない(キャップ0/付与失敗/報酬なしで嘘をつかない)
 * - 表示額はサーバーの実付与額(キャップ後)のみを渡すこと
 * - 完走モーダル(mount)と日記帳リーダー(book, autoDismissMs指定)で共用
 */
export function CompletionRewardPanel({
  amount,
  delayMs = 800,
  autoDismissMs = null,
  className = "",
}: {
  /** サーバーが実際に付与したペルコイン数(0以下はパネル非表示) */
  amount: number;
  /** マウントからポップインまでの「じらし」時間(ms) */
  delayMs?: number;
  /** 着地後この時間でフェードアウトして消える(null=消えない)。book没入ビュー用 */
  autoDismissMs?: number | null;
  className?: string;
}) {
  const [phase, setPhase] = useState<
    "waiting" | "counting" | "landed" | "gone"
  >("waiting");

  useEffect(() => {
    if (amount <= 0) return;
    const timer = window.setTimeout(() => setPhase("counting"), delayMs);
    return () => window.clearTimeout(timer);
  }, [amount, delayMs]);

  useEffect(() => {
    if (phase !== "landed" || autoDismissMs === null) return;
    const timer = window.setTimeout(() => setPhase("gone"), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [phase, autoDismissMs]);

  if (amount <= 0 || phase === "gone") {
    return null;
  }

  const visible = phase !== "waiting";
  const landed = phase === "landed";

  return (
    <div
      className={`pointer-events-none relative mx-auto w-fit transition-all duration-300 ease-out ${
        visible ? "scale-100 opacity-100" : "scale-75 opacity-0"
      } ${className}`}
      aria-live="polite"
    >
      <div
        className={`relative rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white px-6 py-3 shadow-[0_6px_18px_rgba(120,90,50,0.18)] ${
          landed ? "reward-panel-bounce" : ""
        }`}
      >
        <p className="text-xs font-bold tracking-wide text-amber-500">
          完走報酬
        </p>
        <p className="flex items-center justify-center gap-1.5 text-amber-600">
          <Coins className="h-6 w-6" aria-hidden />
          <span className="text-3xl font-extrabold tabular-nums">
            +
            {phase === "waiting" ? (
              0
            ) : (
              <CountUpNumber
                value={amount}
                onDone={() => {
                  setPhase("landed");
                  try {
                    navigator.vibrate?.(50);
                  } catch {
                    // 非対応環境は無視
                  }
                }}
              />
            )}
          </span>
          <span className="text-sm font-bold">ペルコイン</span>
        </p>
        {landed ? (
          <p className="text-xs font-bold text-amber-500">獲得！</p>
        ) : null}
        {/* 着地バースト: コイン粒子を放射状に飛ばす(1回きり) */}
        {landed ? (
          <span aria-hidden className="reward-burst">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ ["--rb-angle" as string]: `${i * 45}deg` }} />
            ))}
          </span>
        ) : null}
      </div>
      <style>{`
        .reward-panel-bounce {
          animation: reward-panel-bounce 480ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes reward-panel-bounce {
          0% { transform: scale(1); }
          35% { transform: scale(1.14); }
          100% { transform: scale(1); }
        }
        .reward-burst {
          position: absolute;
          inset: 0;
          display: block;
        }
        .reward-burst > span {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #fbbf24, #f59e0b);
          transform: translate(-50%, -50%);
          animation: reward-burst-fly 640ms ease-out forwards;
        }
        @keyframes reward-burst-fly {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) rotate(var(--rb-angle)) translateX(0);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--rb-angle)) translateX(64px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .reward-panel-bounce { animation: none; }
          .reward-burst > span { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
