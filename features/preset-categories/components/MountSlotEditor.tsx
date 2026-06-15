"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NormalizedSlotRect } from "@/features/collections/lib/mount-layouts";
import {
  alignGroup,
  applyAspect,
  distributeEvenly,
  joinSlots,
  movePosition,
  pixelAspectRatio,
  resizeShared,
  splitSlots,
  type Corner,
  type DistributeAxis,
  type EditorSlots,
  type HAlign,
  type VAlign,
} from "@/features/collections/lib/slot-edit-geometry";
import { GEMINI_SUPPORTED_ASPECT_RATIOS } from "@/shared/generation/gemini-aspect-ratio";

/** 1枠の最小辺(px)。これ以下にはリサイズできない。 */
const MIN_SLOT_PX = 24;

/** 比率が未検出のときの既定ラベル */
const DEFAULT_ASPECT = "1:1";

/** 現在のピクセル比に最も近いプリセット比のラベルを返す。 */
function detectAspectLabel(
  slots: NormalizedSlotRect[],
  templateWidth: number,
  templateHeight: number,
): string {
  if (slots.length === 0) return DEFAULT_ASPECT;
  const ratio = pixelAspectRatio(
    { w: slots[0].w, h: slots[0].h },
    templateWidth,
    templateHeight,
  );
  let best = DEFAULT_ASPECT;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const entry of GEMINI_SUPPORTED_ASPECT_RATIOS) {
    const diff = Math.abs(entry.value - ratio) / entry.value;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry.label;
    }
  }
  return best;
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
  // 選択中の枠(複数選択可)。整列は選択枠が2つ以上ならその枠だけに効く。
  const [selection, setSelection] = useState<number[]>([0]);
  // スマホ用の複数選択モード(ON 中はタップで選択の追加/解除)
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // 比率は常に固定(リサイズで比率を維持する)
  const lockRatio = true;
  const state = splitSlots(slots);
  // 数値表示用の代表枠(最後に触れた枠)
  const primary = selection[selection.length - 1] ?? 0;

  function toggleSelection(index: number) {
    setSelection((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index],
    );
  }

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
    // Shift/Cmd(PC) または 複数選択モード(スマホ) のときは選択トグルのみ(移動しない)
    if (e.shiftKey || e.metaKey || multiSelectMode) {
      toggleSelection(index);
      return;
    }
    setSelection([index]);
    dragRef.current = {
      kind: "move",
      index,
      startX: e.clientX,
      startY: e.clientY,
      start: splitSlots(slots),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function beginResize(e: ReactPointerEvent, corner: Corner) {
    e.preventDefault();
    e.stopPropagation();
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

  function handleAlign(hAlign: HAlign | null, vAlign: VAlign | null) {
    // 2つ以上選択されていればその枠だけを対象に、そうでなければ全枠を整列する
    const indices = selection.length >= 2 ? selection : undefined;
    onChange(joinSlots(alignGroup(splitSlots(slots), hAlign, vAlign, indices)));
  }

  function handleDistribute(axis: DistributeAxis) {
    // 2つ以上選択されていればその枠だけを対象に、そうでなければ全枠を分布する
    const indices = selection.length >= 2 ? selection : undefined;
    onChange(joinSlots(distributeEvenly(splitSlots(slots), axis, indices)));
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
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={multiSelectMode}
              onChange={(e) => setMultiSelectMode(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            複数選択モード（スマホ用・タップで追加）
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>枠の比率</span>
            <select
              value={aspectLabel}
              onChange={(e) => handleAspectChange(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
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
              selection.includes(index)
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
                onPointerDown={(e) => beginResize(e, corner)}
                className={`absolute h-3 w-3 rounded-sm border border-white bg-sky-500 ${className}`}
                style={{ cursor }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 枠全体(グループ)の整列。相対配置・サイズは保ったまま平行移動する。 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        <div className="flex items-center gap-1">
          <span className="text-slate-500">横:</span>
          <button
            type="button"
            onClick={() => handleAlign("left", null)}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
          >
            左寄せ
          </button>
          <button
            type="button"
            onClick={() => handleAlign("center", null)}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
          >
            中央
          </button>
          <button
            type="button"
            onClick={() => handleAlign("right", null)}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
          >
            右寄せ
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-500">縦:</span>
          <button
            type="button"
            onClick={() => handleAlign(null, "top")}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
          >
            上寄せ
          </button>
          <button
            type="button"
            onClick={() => handleAlign(null, "middle")}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
          >
            中央
          </button>
          <button
            type="button"
            onClick={() => handleAlign(null, "bottom")}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
          >
            下寄せ
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-500">均等:</span>
          <button
            type="button"
            onClick={() => handleDistribute("horizontal")}
            disabled={state.positions.length < 3}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            横を等間隔
          </button>
          <button
            type="button"
            onClick={() => handleDistribute("vertical")}
            disabled={state.positions.length < 3}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            縦を等間隔
          </button>
        </div>
      </div>

      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p>
          共有サイズ: 幅 {pct(state.size.w)} × 高さ {pct(state.size.h)}
          （1枠をリサイズすると全 {state.positions.length} 枠が同じサイズに連動します）
        </p>
        <p className="mt-1">
          選択中: {selection.length >= 1 ? `枠 ${selection.map((i) => i + 1).join(", ")}` : "なし"}
          {selection.length >= 2
            ? "（整列・均等は選択枠だけに効きます）"
            : "（整列・均等は全枠に効きます）"}
        </p>
        <p className="mt-1">
          枠 {primary + 1} の位置: x {pct(state.positions[primary]?.x ?? 0)}, y{" "}
          {pct(state.positions[primary]?.y ?? 0)}
        </p>
        <p className="mt-1 text-slate-400">
          枠の中央をドラッグで移動、四隅の青ハンドルでサイズ変更。複数選択は PC=Shift+クリック / スマホ=複数選択モードをON。
        </p>
      </div>
    </div>
  );
}
