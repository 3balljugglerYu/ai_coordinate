"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NormalizedSlotRect } from "@/features/collections/lib/mount-layouts";
import {
  applyAspect,
  joinSlots,
  movePosition,
  pixelAspectRatio,
  resizeShared,
  splitSlots,
  type Corner,
  type EditorSlots,
} from "@/features/collections/lib/slot-edit-geometry";
import { GEMINI_SUPPORTED_ASPECT_RATIOS } from "@/shared/generation/gemini-aspect-ratio";

/** 1枠の最小辺(px)。これ以下にはリサイズできない。 */
const MIN_SLOT_PX = 24;

/** アスペクト比セレクタの「自由(ロック解除)」を表す番兵値 */
const FREE_ASPECT = "free";

/** 現在のピクセル比に最も近いプリセット比を許容誤差内で検出。無ければ "free"。 */
function detectAspectLabel(
  slots: NormalizedSlotRect[],
  templateWidth: number,
  templateHeight: number,
): string {
  if (slots.length === 0) return FREE_ASPECT;
  const ratio = pixelAspectRatio(
    { w: slots[0].w, h: slots[0].h },
    templateWidth,
    templateHeight,
  );
  let best = FREE_ASPECT;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const entry of GEMINI_SUPPORTED_ASPECT_RATIOS) {
    const diff = Math.abs(entry.value - ratio) / entry.value;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry.label;
    }
  }
  // 相対誤差 2% 以内なら一致とみなす。それ以外は自由。
  return bestDiff <= 0.02 ? best : FREE_ASPECT;
}

const CORNERS: { corner: Corner; className: string; cursor: string }[] = [
  { corner: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { corner: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { corner: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
  { corner: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
];

interface Props {
  /** 台紙テンプレ画像のプレビューURL(admin API 経由) */
  templateUrl: string;
  /** 台紙テンプレ実寸(px)。アスペクト比・ピクセル換算に使う */
  templateWidth: number;
  templateHeight: number;
  /** 現在の枠(正規化矩形配列)。全枠同サイズ前提。 */
  slots: NormalizedSlotRect[];
  /** 枠が変化したら呼ばれる(正規化矩形配列) */
  onChange: (slots: NormalizedSlotRect[]) => void;
}

type DragState =
  | { kind: "move"; index: number; startX: number; startY: number; start: EditorSlots }
  | { kind: "resize"; corner: Corner; startX: number; startY: number; start: EditorSlots };

export function MountSlotEditor({
  templateUrl,
  templateWidth,
  templateHeight,
  slots,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [aspectLabel, setAspectLabel] = useState(() =>
    detectAspectLabel(slots, templateWidth, templateHeight),
  );
  const [selected, setSelected] = useState(0);

  // 比率プリセットが選ばれている間はリサイズで比率を維持する
  const lockRatio = aspectLabel !== FREE_ASPECT;
  const state = splitSlots(slots);

  /** ポインタ移動量(px)を正規化(0..1)へ換算する。コンテナ実描画寸法で割る。 */
  function toNorm(dxPx: number, dyPx: number): { dxNorm: number; dyNorm: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 1;
    const h = rect?.height ?? 1;
    return { dxNorm: dxPx / w, dyNorm: dyPx / h };
  }

  function beginMove(e: ReactPointerEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(index);
    dragRef.current = {
      kind: "move",
      index,
      startX: e.clientX,
      startY: e.clientY,
      start: splitSlots(slots),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function beginResize(e: ReactPointerEvent, corner: Corner, index: number) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(index);
    dragRef.current = {
      kind: "resize",
      corner,
      startX: e.clientX,
      startY: e.clientY,
      start: splitSlots(slots),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const { dxNorm, dyNorm } = toNorm(e.clientX - drag.startX, e.clientY - drag.startY);

    if (drag.kind === "move") {
      const next: EditorSlots = {
        size: drag.start.size,
        positions: drag.start.positions.map((p, i) =>
          i === drag.index
            ? movePosition(p, drag.start.size, dxNorm, dyNorm)
            : p,
        ),
      };
      onChange(joinSlots(next));
      return;
    }

    const next = resizeShared(drag.start, drag.corner, dxNorm, dyNorm, {
      lockRatio,
      templateWidth,
      templateHeight,
      minPx: MIN_SLOT_PX,
    });
    onChange(joinSlots(next));
  }

  function handleAspectChange(label: string) {
    setAspectLabel(label);
    if (label === FREE_ASPECT) return; // 自由: 比率ロックを外すだけ
    const entry = GEMINI_SUPPORTED_ASPECT_RATIOS.find((r) => r.label === label);
    if (!entry) return;
    const next = applyAspect(
      splitSlots(slots),
      entry.value,
      templateWidth,
      templateHeight,
      MIN_SLOT_PX,
    );
    onChange(joinSlots(next));
  }

  function endDrag(e: ReactPointerEvent) {
    if (dragRef.current) {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">枠調整モード</span>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span>枠の比率</span>
          <select
            value={aspectLabel}
            onChange={(e) => handleAspectChange(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value={FREE_ASPECT}>自由（ロック解除）</option>
            {GEMINI_SUPPORTED_ASPECT_RATIOS.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
                {r.label === "1:1"
                  ? "（正方形）"
                  : r.value < 1
                    ? "（縦長）"
                    : "（横長）"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-w-md select-none overflow-hidden rounded-md border border-slate-300 bg-slate-100"
        style={{ aspectRatio: `${templateWidth} / ${templateHeight}`, touchAction: "none" }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 台紙背景 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={templateUrl}
          alt="台紙テンプレ"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />

        {/* 枠 */}
        {state.positions.map((pos, index) => (
          <div
            key={index}
            onPointerDown={(e) => beginMove(e, index)}
            className={`absolute cursor-move border-2 ${
              index === selected
                ? "border-sky-500 bg-sky-500/10"
                : "border-slate-400/80 bg-slate-400/5"
            }`}
            style={{
              left: pct(pos.x),
              top: pct(pos.y),
              width: pct(state.size.w),
              height: pct(state.size.h),
            }}
          >
            <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1 text-[10px] font-medium leading-tight text-white">
              {index + 1}
            </span>
            {CORNERS.map(({ corner, className, cursor }) => (
              <span
                key={corner}
                onPointerDown={(e) => beginResize(e, corner, index)}
                className={`absolute h-3 w-3 rounded-sm border border-white bg-sky-500 ${className}`}
                style={{ cursor }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p>
          共有サイズ: 幅 {pct(state.size.w)} × 高さ {pct(state.size.h)}
          （1枠をリサイズすると全 {state.positions.length} 枠が同じサイズに連動します）
        </p>
        <p className="mt-1">
          枠 {selected + 1} の位置: x {pct(state.positions[selected]?.x ?? 0)}, y{" "}
          {pct(state.positions[selected]?.y ?? 0)}
        </p>
        <p className="mt-1 text-slate-400">
          枠の中央をドラッグで移動、四隅の青ハンドルでサイズ変更。
        </p>
      </div>
    </div>
  );
}
