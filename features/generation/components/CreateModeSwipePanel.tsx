"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type CreateMode = "prompt" | "reference";
interface CreateModeSwipePanelProps {
  activeMode: CreateMode;
  onModeChange: (mode: CreateMode) => void;
  enabled: boolean;
  children: ReactNode;
}
interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  horizontal: boolean;
  rtl: boolean;
}

// 一覧のスワイプと同じ方向判定・確定距離。フォームは1つだけ描き、入力を保持する。
const DIRECTION_LOCK_PX = 6;
const EDGE_GUTTER_PX = 24;
const COMMIT_RATIO = 0.2;
const COMMIT_MAX_PX = 96;
const INPUT_TARGETS = 'input, textarea, select, button, a, label, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [role="dialog"], [data-create-swipe-ignore]';

export function CreateModeSwipePanel({
  activeMode,
  onModeChange,
  enabled,
  children,
}: CreateModeSwipePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  const animationRef = useRef<Animation | null>(null);
  const previousModeRef = useRef(activeMode);

  function reset() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    const panel = panelRef.current;
    if (gesture && panel?.hasPointerCapture?.(gesture.pointerId)) {
      panel.releasePointerCapture(gesture.pointerId);
    }
    if (trackRef.current) trackRef.current.style.transform = "";
  }

  useLayoutEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = activeMode;
    reset();
    animationRef.current?.cancel();
    animationRef.current = null;
    const track = trackRef.current;
    if (!enabled || previous === activeMode || !track?.animate ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const forward = activeMode === "reference";
    const rtl = panelRef.current?.closest("[dir]")?.getAttribute("dir") === "rtl";
    const offset = forward !== rtl ? 24 : -24;
    animationRef.current = track.animate(
      [{transform:`translateX(${offset}%)`,opacity:0.5},{transform:"translateX(0)",opacity:1}],
      {duration:200,easing:"ease-out"},
    );
  }, [activeMode, enabled]);

  useEffect(() => () => { animationRef.current?.cancel(); }, []);

  function targetFor(dx: number, rtl: boolean): CreateMode | null {
    const next = rtl ? dx > 0 : dx < 0;
    if (next && activeMode === "prompt") return "reference";
    if (!next && activeMode === "reference") return "prompt";
    return null;
  }

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    suppressClickRef.current = false;
    if (!event.isPrimary) { reset(); return; }
    if (!enabled || event.button !== 0) return;
    const target = event.target;
    // 入力・画像選択・ダイアログなどの独自操作を奪わない（portalからのイベントも除く）。
    if (!(target instanceof Element) || !event.currentTarget.contains(target) || target.closest(INPUT_TARGETS)) return;
    if (event.pointerType !== "mouse" &&
      (event.clientX < EDGE_GUTTER_PX || event.clientX > window.innerWidth - EDGE_GUTTER_PX)) return;
    animationRef.current?.cancel();
    reset();
    gestureRef.current = {
      pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,horizontal:false,
      rtl:event.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl",
    };
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!enabled || !gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_LOCK_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) { reset(); return; }
      gesture.horizontal = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    const offset = targetFor(dx, gesture.rtl) === null ? dx * 0.25 : dx;
    if (trackRef.current && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      trackRef.current.style.transform = `translateX(${offset}px)`;
    }
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const width = event.currentTarget.clientWidth || window.innerWidth;
    const target = targetFor(dx, gesture.rtl);
    const shouldChange = enabled && gesture.horizontal && target !== null &&
      Math.abs(dx) > Math.min(width * COMMIT_RATIO, COMMIT_MAX_PX);
    suppressClickRef.current = gesture.horizontal;
    reset();
    if (shouldChange) onModeChange(target);
  }

  return (
    <div
      ref={panelRef}
      data-testid="create-mode-swipe-panel"
      className={enabled ? "overflow-x-clip" : undefined}
      style={enabled ? {touchAction:"pan-y pinch-zoom"} : undefined}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={reset}
      onLostPointerCapture={(event) => {
        // touch開始要素からpanelへのcapture移譲は中止ではない。
        if (event.target === event.currentTarget && event.pointerId === gestureRef.current?.pointerId) reset();
      }}
      onDragStart={(event) => { if (gestureRef.current) event.preventDefault(); }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div ref={trackRef}>{children}</div>
    </div>
  );
}
