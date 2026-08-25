"use client";

import { useCallback, useRef, useState } from "react";
import {
  moveBoundary,
  toBoundaryList,
  type SplitBoundaries,
} from "../lib/split-boundaries";
import type { SplitAxis } from "../lib/split-image";

/**
 * 元画像の上に分割線を重ね、ドラッグで動かせるようにする。
 *
 * ## なぜ要るか
 *
 * 等分だけだと切れ目がキャラクターの顔や体を横切ることがよくある。
 * 仕切りを動かせれば「どこで切るか」を選べるし、**両端も動かせる**ので
 * 使う範囲そのものを詰められる(トリミング)。左に寄った構図なら右端を
 * 詰めるだけで線が体を外れる、という逃げ道ができる。
 *
 * ## ポインタの扱い
 *
 * `setPointerCapture` を使い、指が画像の外へ出ても追従させる。
 * 端の線は画像の縁にあるので、**capture 無しだと掴んだ瞬間に外れる**。
 *
 * `touch-action: none` を敷いてブラウザのスクロールを止める。
 * これが無いとスマホで線を掴んでもページが縦に流れて操作にならない。
 */

/** つまみの当たり判定(px)。指で掴めるだけの太さを確保する。 */
const HANDLE_HIT_SIZE = 32;

export function SplitBoundaryEditor({
  imageUrl,
  axis,
  boundaries,
  onChange,
  onCommit,
  disabled = false,
}: {
  /** 元画像の objectURL。 */
  imageUrl: string;
  axis: SplitAxis;
  boundaries: SplitBoundaries;
  onChange: (next: SplitBoundaries) => void;
  /**
   * 指を離した(=位置が確定した)とき。**ドラッグ中は呼ばない。**
   * 1本動かすたびに切り直すと画像を何枚もデコードすることになり、
   * 指に追従しなくなる。
   */
  onCommit: (next: SplitBoundaries) => void;
  disabled?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const isVertical = axis === "vertical";
  const list = toBoundaryList(boundaries);

  /** ポインタ位置 → 0..1。画像の表示領域を基準にする。 */
  const ratioFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const frame = frameRef.current;
      if (!frame) return 0;
      const rect = frame.getBoundingClientRect();
      const value = isVertical
        ? (clientX - rect.left) / rect.width
        : (clientY - rect.top) / rect.height;
      return Math.min(Math.max(value, 0), 1);
    },
    [isVertical],
  );

  const handlePointerDown = (index: number) => (event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    /*
      指が画像の外へ出ても追従させる(端の線は縁にあるので必須)。
      実ポインタでない場合(自動テストの合成イベント等)は例外になるので、
      **掴めなくなるより捕捉なしで続ける**方へ倒す。
    */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 捕捉できなくてもドラッグ自体は続けられる
    }
    setDraggingIndex(index);
  };

  const handlePointerMove = (index: number) => (event: React.PointerEvent) => {
    if (draggingIndex !== index) return;
    event.preventDefault();
    onChange(
      moveBoundary(
        boundaries,
        index,
        ratioFromEvent(event.clientX, event.clientY),
      ),
    );
  };

  const endDrag = (event: React.PointerEvent) => {
    if (draggingIndex === null) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 既に解放済みなら何もしない
    }
    setDraggingIndex(null);
    onCommit(boundaries);
  };

  /** キーボードでも動かせるようにする(1回 1%)。 */
  const handleKeyDown = (index: number) => (event: React.KeyboardEvent) => {
    if (disabled) return;
    const backward = isVertical ? "ArrowLeft" : "ArrowUp";
    const forward = isVertical ? "ArrowRight" : "ArrowDown";
    if (event.key !== backward && event.key !== forward) return;
    event.preventDefault();
    const delta = event.key === forward ? 0.01 : -0.01;
    const next = moveBoundary(boundaries, index, list[index] + delta);
    onChange(next);
    // キー操作は1回で確定(押しっぱなしでも都度切り直すほど重くない)
    onCommit(next);
  };

  return (
    <div
      ref={frameRef}
      className="relative select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
      style={{ touchAction: "none" }}
    >
      {/* 元画像。objectURL なので next/image は使えない */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="分割する画像"
        className="block w-full"
        draggable={false}
      />

      {/* 使う範囲の外は暗くする。捨てられる部分が一目で分かるようにする */}
      <div
        aria-hidden
        className="pointer-events-none absolute bg-slate-900/55"
        style={
          isVertical
            ? { left: 0, top: 0, bottom: 0, width: `${boundaries.start * 100}%` }
            : { left: 0, right: 0, top: 0, height: `${boundaries.start * 100}%` }
        }
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bg-slate-900/55"
        style={
          isVertical
            ? {
                right: 0,
                top: 0,
                bottom: 0,
                width: `${(1 - boundaries.end) * 100}%`,
              }
            : {
                left: 0,
                right: 0,
                bottom: 0,
                height: `${(1 - boundaries.end) * 100}%`,
              }
        }
      />

      {list.map((ratio, index) => {
        const isStart = index === 0;
        const isEnd = index === list.length - 1;
        const isEdge = isStart || isEnd;
        const percent = `${ratio * 100}%`;
        const active = draggingIndex === index;
        /*
          ⭐ 当たり判定を**内側へ寄せる**。中央揃え(translate -50%)のままだと、
          端のつまみは半分が枠の外に出て `overflow-hidden` に切り取られ、
          **掴めなくなる**(実ブラウザで確認)。線の見た目は境界のままにして、
          掴む面積だけ内側に伸ばす。
        */
        const shift = isStart ? "0" : isEnd ? "-100%" : "-50%";
        return (
          <div
            key={index}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={
              isEdge
                ? index === 0
                  ? "使う範囲の始まり"
                  : "使う範囲の終わり"
                : `${index}本目の分割線`
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-orientation={isVertical ? "horizontal" : "vertical"}
            data-testid={
              isEdge
                ? `split-boundary-edge-${index === 0 ? "start" : "end"}`
                : `split-boundary-divider-${index}`
            }
            onPointerDown={handlePointerDown(index)}
            onPointerMove={handlePointerMove(index)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={handleKeyDown(index)}
            className={`absolute z-10 flex items-center justify-center focus-visible:outline-none ${
              disabled ? "cursor-default" : isVertical ? "cursor-ew-resize" : "cursor-ns-resize"
            }`}
            style={
              isVertical
                ? {
                    left: percent,
                    top: 0,
                    bottom: 0,
                    width: HANDLE_HIT_SIZE,
                    transform: `translateX(${shift})`,
                  }
                : {
                    top: percent,
                    left: 0,
                    right: 0,
                    height: HANDLE_HIT_SIZE,
                    transform: `translateY(${shift})`,
                  }
            }
          >
            {/*
              線とつまみは**境界の位置に置く**。当たり判定だけ内側へ寄せたので、
              見た目が判定に引きずられないよう位置を打ち消す。
            */}
            <span
              aria-hidden
              className={`absolute bg-pink-500 shadow-[0_0_0_1px_rgba(255,255,255,0.9)] ${
                active ? "opacity-100" : "opacity-90"
              }`}
              style={
                isVertical
                  ? {
                      top: 0,
                      bottom: 0,
                      width: 2,
                      left: isStart ? 0 : isEnd ? undefined : "50%",
                      right: isEnd ? 0 : undefined,
                    }
                  : {
                      left: 0,
                      right: 0,
                      height: 2,
                      top: isStart ? 0 : isEnd ? undefined : "50%",
                      bottom: isEnd ? 0 : undefined,
                    }
              }
            />
            <span
              aria-hidden
              className={`absolute rounded-full border-2 border-white bg-pink-500 shadow transition-transform ${
                active ? "scale-125" : ""
              }`}
              style={
                isVertical
                  ? {
                      width: 12,
                      height: 28,
                      left: isStart ? 0 : isEnd ? undefined : "50%",
                      right: isEnd ? 0 : undefined,
                      transform: isEdge ? undefined : "translateX(-50%)",
                    }
                  : {
                      width: 28,
                      height: 12,
                      top: isStart ? 0 : isEnd ? undefined : "50%",
                      bottom: isEnd ? 0 : undefined,
                      transform: isEdge ? undefined : "translateY(-50%)",
                    }
              }
            />
          </div>
        );
      })}
    </div>
  );
}
