import { HALLOWEEN_BEST_SHOT } from "../halloween-best-shot";
import { HALLOWEEN_TARGET_BADGE_CLASS } from "../halloween-target-style";

/**
 * 対象作品の画像の左上に出す「ハロウィン企画対象！」(2026-10-16 ユーザー指示。かぼちゃの絵文字は付けない)。
 *
 * 位置は持たない。カード側の「左上の器」(完走・🆕 と同じ flex 行)に入れる。
 * 出すかどうかは呼び出し側が useIsHalloweenTarget で決める(期間中・日本語の画面だけ)。
 * 文字は日本語だけ(企画が日本国内向けで、日本語の画面にしか出さないため)。
 *
 * `compact` はグリッドのカード用。2列のカードでは右上の「…」と並ぶので、文字を1段小さくする。
 * 折り返さない(幅 320px で「ハロウィン企画対／象！」と言葉の途中で折れていたため)。
 * 320px でも「…」の手前に収まることは実測済み。
 */
export function HalloweenTargetBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`pointer-events-none inline-flex items-center whitespace-nowrap rounded-full font-bold leading-tight shadow ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      } ${HALLOWEEN_TARGET_BADGE_CLASS}`}
      data-testid="halloween-target-badge"
    >
      {HALLOWEEN_BEST_SHOT.targetBadgeLabel}
    </span>
  );
}
