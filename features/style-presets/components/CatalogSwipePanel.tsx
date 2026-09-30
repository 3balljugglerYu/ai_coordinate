"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

/** 画面の端から始まる操作は、ブラウザの「戻る/進む」(iPhone の端スワイプなど)に譲る。 */
const EDGE_GUTTER_PX = 24;
/**
 * 縦か横かを決めるまでの遊び。ブラウザが縦スクロールを始める前に決めたいので小さめにする
 * (決める前にスクロールが始まると、横に動かしている間も縦に流れてしまう)。
 */
const DIRECTION_LOCK_PX = 6;
/** 離したときに切り替える距離。一覧の幅の 20%(ただし 96px まで)。 */
const COMMIT_RATIO = 0.2;
const COMMIT_MAX_PX = 96;
/** 素早く払ったときは、短い距離でも切り替える。 */
const FLICK_MIN_PX = 24;
const FLICK_VELOCITY_PX_PER_MS = 0.4;
/** 隣のタブが無い向きへ引いたときの手応え(指の動きに対する割合)。 */
const EDGE_RESISTANCE = 0.25;
/** 隣のタブの一覧との間隔。領域の左右の余白(px-4 = 16px)の2つ分。 */
const PAGE_GAP_PX = 32;
/** タップでタブを変えたとき、新しい一覧が入ってくるときのずらし始めの量(一覧の幅に対する %)。 */
const ENTER_OFFSET_PERCENT = 24;

/** タブの一覧の描き方。page = 選択中のタブの一覧(全部)、peek = 隣に見せる先頭部分。 */
export type CatalogTabMode = "page" | "peek";

interface Gesture {
  identifier: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  /** 直近の横の速さ(px/ms)。素早く払ったかどうかを見る。 */
  velocity: number;
  /** いま一覧をずらしている量(端の手応えを反映した後)。 */
  offset: number;
  /** 横の操作と決まったか。決まるまでは何もしない。 */
  horizontal: boolean;
  rtl: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canAnimate(element: HTMLElement): boolean {
  return typeof element.animate === "function" && !prefersReducedMotion();
}

/** 指で操作する端末か(PC では隣のタブを先に用意しない)。 */
function isTouchDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function isRtl(element: HTMLElement): boolean {
  return element.closest("[dir]")?.getAttribute("dir") === "rtl";
}

/**
 * 指を動かした向きを、タブの移動量(+1 = 次 / -1 = 前)にする。
 * 左へ払うと次のタブ(ページをめくる向き)。右から左へ並ぶ言語では逆になる。
 */
function stepFor(dx: number, rtl: boolean): 1 | -1 {
  const step = dx < 0 ? 1 : -1;
  return rtl ? (step === 1 ? -1 : 1) : step;
}

function findTouch(list: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < list.length; index += 1) {
    const touch = list[index];
    if (touch.identifier === identifier) {
      return touch;
    }
  }
  return null;
}

/**
 * タブ列を上に固定していない画面(マイページ)で、一覧の先頭を見せたい位置。
 * lg 未満はヘッダーが流れるので画面の上端、lg 以上は固定ヘッダーの直下
 * (`StylesCatalogChipBar` の top と同じ考え方)。
 */
function viewportListTop(): number {
  if (
    typeof window.matchMedia !== "function" ||
    !window.matchMedia("(min-width: 1024px)").matches
  ) {
    return 0;
  }
  return (
    Number.parseFloat(
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--app-header-height")
    ) || 64
  );
}

/**
 * 一覧の先頭を見せたい位置(画面の上からの距離)と、いまの一覧の先頭の位置。
 * 一覧の先頭は、上に固定したタブ列(`StylesCatalogChipBar` の `data-catalog-tab-bar`)の
 * すぐ下に来るのが正しい。タブ列はこの領域と同じ親の中にある。
 * タブ列を固定していない画面(マイページ)では、画面の上端にそろえる。
 * 一覧の途中までスクロールしていても、隣のタブの一覧を先頭から見せるため。
 */
function measureListTop(panel: HTMLElement): { desired: number; current: number } {
  const bar = panel.parentElement?.querySelector<HTMLElement>(
    "[data-catalog-tab-bar]"
  );
  if (!bar) {
    return {
      desired: viewportListTop(),
      current: panel.getBoundingClientRect().top,
    };
  }
  const gap = Number.parseFloat(window.getComputedStyle(bar).marginBottom) || 0;
  return {
    desired: bar.getBoundingClientRect().bottom + gap,
    current: panel.getBoundingClientRect().top,
  };
}

/**
 * 一覧の先頭が、上に固定したタブ列の裏に隠れていたら、先頭が見える位置まで戻す。
 * タブを切り替えたのに、新しい一覧を途中から見せないため。
 */
function revealListTop(panel: HTMLElement) {
  const top = measureListTop(panel);
  if (top.current < top.desired - 1) {
    window.scrollBy({ top: top.current - top.desired, behavior: "instant" });
  }
}

/**
 * スタイルカタログのタブの中身(一覧)を並べ、横スワイプで隣のタブへ切り替える。
 * カタログ刷新(段階公開中は運営のみ)で、`CatalogTabBar` と組にして使う。
 *
 * ## 操作(一般的なアプリのタブと同じ)
 * - 左へ払うと次のタブ、右へ払うと前のタブ
 * - 払っている間は、今の一覧と一緒に、隣のタブの一覧が横に並んで指についてくる。
 *   隣のタブの一覧は先頭から、固定したタブ列のすぐ下にそろえて見せる
 * - 一覧の幅の 20%(最大 96px)より動かすか、素早く払うと、隣のタブを最後まで引き込んで
 *   切り替える。足りなければ元へ戻る
 * - 隣が無い向き(先頭のタブで右へ、最後のタブで左へ)は、手応えだけ返して切り替えない
 * - 横に動かしている間は、縦にスクロールさせない
 *
 * ## 縦スクロールとの見分け
 * `touch-action: pan-y` で縦の操作はブラウザに任せ、動き始めの向きで見分ける。
 * 横と決めたら、その後の touchmove を止めて(preventDefault)縦に流れないようにする。
 * iPhone の Safari では touch-action だけだと斜めの動きで縦にも流れるため、
 * touchmove を直接止める(React の onTouchMove は passive で止められないので、
 * addEventListener で passive: false を付けて登録する)。
 *
 * 次の操作は対象にしない。
 * - マウスでのドラッグ(タッチ操作だけを扱う。文字の選択やカードのクリックを邪魔しない)
 * - 画面の端から始まる操作(ブラウザの「戻る/進む」に譲る)
 * - 2本指の操作(拡大縮小)
 *
 * 横に動かした指を離したときのクリックは捨てる(カードが開かないように)。
 *
 * ## 隣のタブの中身を先に用意し、そのまま今の一覧にする
 * 選択中のタブの一覧(page)の左右に、前後のタブの一覧の先頭(peek)を置いておく
 * (操作できない見本として。inert)。指で触れる端末では、画面が落ち着いた時点で用意し、
 * 画像も先に読み込ませる。払い始めたときにはもう中身が見えている状態にするため。
 * PC では用意しない(マウスでは横スワイプしない)。万一まだなら、指が触れた時点で用意する。
 *
 * ⭐ 一覧の入れ物はタブの ID を key にして描く。切り替えると、隣に置いていた入れ物が
 * そのまま今の一覧になる(作り直さない)。作り直すと、表示済みのアイコンや画像まで
 * 読み込み直しになり、切り替えた瞬間に一度グレーの下地が見えてしまう。
 * そのため `renderTab` は、同じタブなら page でも peek でも同じ形(同じ並び・同じ key)で
 * 描くこと(peek は件数を絞るだけ)。
 *
 * ## タブが変わったとき
 * - スワイプで変えたとき: 引き込んだ隣の一覧を、そのまま同じ位置で今の一覧にする
 * - タップで変えたとき: 新しい一覧を移動した向きから入れる
 * どちらも、一覧の先頭が固定したタブ列の裏にあれば、先頭まで戻す。
 *
 * 動かす量は DOM の style と Web Animations で直接書き、指の動きのたびに再レンダリングしない。
 * 動きを減らす設定(prefers-reduced-motion)では、ずらさずに切り替えだけ行う。
 */
export function CatalogSwipePanel<K extends string>({
  tabKeys,
  activeKey,
  onSwipeTo,
  renderTab,
}: {
  /** タブの ID(タブ列の並び順どおり)。 */
  tabKeys: readonly K[];
  /** 選択中のタブの ID。変わったときだけ、先頭へ戻して新しい一覧を出す。 */
  activeKey: K;
  /** 横スワイプで隣のタブへ移るとき。 */
  onSwipeTo: (key: K) => void;
  /**
   * タブの一覧を描く。page は選択中のタブの一覧(全部)、peek は払っている間に隣に見せる
   * 先頭部分(画面の高さを埋める分だけ)。peek から page に変わっても作り直さないよう、
   * 同じ形で描くこと。
   */
  renderTab: (key: K, mode: CatalogTabMode) => ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousPeekRef = useRef<HTMLDivElement | null>(null);
  const nextPeekRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  /** 隣のタブを引き込んでいる動き(終わったら切り替える)。 */
  const commitAnimationRef = useRef<Animation | null>(null);
  /** 切り替えずに元へ戻している動き。次の操作が始まったら止める。 */
  const snapBackAnimationRef = useRef<Animation | null>(null);
  const swipedRef = useRef(false);
  const [peeksMounted, setPeeksMounted] = useState(false);

  const activeIndex = tabKeys.indexOf(activeKey);
  const previousKey = activeIndex > 0 ? tabKeys[activeIndex - 1] : null;
  const nextKey =
    activeIndex >= 0 && activeIndex < tabKeys.length - 1
      ? tabKeys[activeIndex + 1]
      : null;
  const previousRef = useRef({ key: activeKey, index: activeIndex });

  // 指で触れる端末では、画面が落ち着いたら隣のタブの中身を用意する(画像も先に読み込む)。
  useEffect(() => {
    if (peeksMounted || !isTouchDevice()) {
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => setPeeksMounted(true), {
        timeout: 1000,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => setPeeksMounted(true), 300);
    return () => window.clearTimeout(timer);
  }, [peeksMounted]);

  /*
    タブが変わったら、一覧の先頭を見せる。スワイプで変えたときは、引き込んだ隣の一覧が
    そのまま今の一覧になっているので、動きは付けない。タップのときは移動した向きから入れる。
    ID で見るのは、前にタブが差し込まれて位置だけずれたとき(ログイン後の🔖お気に入りなど)に
    動かさないため。描画の前に位置を戻したいので layout effect にする。
  */
  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { key: activeKey, index: activeIndex };
    if (previous.key === activeKey) {
      return;
    }
    const swiped = swipedRef.current;
    swipedRef.current = false;
    const panel = panelRef.current;
    const track = trackRef.current;
    const content = contentRef.current;
    if (!panel || !track || !content) {
      return;
    }
    // 引き込みの動き(fill: forwards で止めてある)を外し、並びを元の位置へ戻す
    commitAnimationRef.current?.cancel();
    commitAnimationRef.current = null;
    track.style.transform = "";
    revealListTop(panel);
    if (swiped || !canAnimate(content)) {
      return;
    }
    const forward = activeIndex >= previous.index;
    const fromRight = isRtl(panel) ? !forward : forward;
    content.animate(
      [
        {
          transform: `translate3d(${fromRight ? ENTER_OFFSET_PERCENT : -ENTER_OFFSET_PERCENT}%, 0, 0)`,
          opacity: 0,
        },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }, [activeKey, activeIndex]);

  /** 隣のタブの一覧を、固定したタブ列のすぐ下(今見えている位置)にそろえる。 */
  const alignPeeks = () => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const top = measureListTop(panel);
    const offset = Math.max(0, top.desired - top.current);
    for (const peek of [previousPeekRef.current, nextPeekRef.current]) {
      if (peek) {
        peek.style.top = `${offset}px`;
      }
    }
  };

  /** 切り替えずに、ずらした並びを元の位置へ戻す。 */
  const settle = (offset: number) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    track.style.transform = "";
    if (offset === 0 || !canAnimate(track)) {
      return;
    }
    snapBackAnimationRef.current = track.animate(
      [
        { transform: `translate3d(${offset}px, 0, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  };

  /** 隣のタブの一覧を最後まで引き込んでから、切り替える。 */
  const commit = (targetKey: K, offset: number, dx: number) => {
    const track = trackRef.current;
    if (!track || !canAnimate(track)) {
      swipedRef.current = true;
      onSwipeTo(targetKey);
      return;
    }
    track.style.transform = "";
    const target = (dx < 0 ? -1 : 1) * (track.offsetWidth + PAGE_GAP_PX);
    const animation = track.animate(
      [
        { transform: `translate3d(${offset}px, 0, 0)` },
        { transform: `translate3d(${target}px, 0, 0)` },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
    commitAnimationRef.current = animation;
    animation.onfinish = () => {
      // 同期で切り替え、並びを戻すのと新しい一覧を出すのを同じフレームで行う
      swipedRef.current = true;
      flushSync(() => onSwipeTo(targetKey));
      // 親が切り替えなかったときに、並びがずれたまま残らないよう戻す
      if (commitAnimationRef.current === animation) {
        swipedRef.current = false;
        animation.cancel();
        commitAnimationRef.current = null;
      }
    };
  };

  /** 指を動かした向きの隣のタブ(無ければ null)。 */
  const neighborFor = (dx: number, rtl: boolean) =>
    stepFor(dx, rtl) === 1 ? nextKey : previousKey;

  const handleTouchStart = useEffectEvent((event: TouchEvent) => {
    suppressClickRef.current = false;
    if (event.touches.length !== 1) {
      // 2本目の指が触れたら(拡大縮小)、横の操作はやめる
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.horizontal) {
        settle(gesture.offset);
      }
      return;
    }
    if (
      (previousKey === null && nextKey === null) ||
      // 引き込み中は次の操作を受けない(二重に切り替わらないように)
      commitAnimationRef.current !== null
    ) {
      return;
    }
    const touch = event.touches[0];
    if (
      touch.clientX < EDGE_GUTTER_PX ||
      touch.clientX > window.innerWidth - EDGE_GUTTER_PX
    ) {
      return;
    }
    if (!peeksMounted) {
      setPeeksMounted(true);
    }
    // 元へ戻している途中なら止めて、この指の動きに合わせる
    snapBackAnimationRef.current?.cancel();
    snapBackAnimationRef.current = null;
    gestureRef.current = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      offset: 0,
      horizontal: false,
      rtl: isRtl(event.currentTarget as HTMLElement),
    };
  });

  const handleTouchMove = useEffectEvent((event: TouchEvent) => {
    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }
    const touch = findTouch(event.touches, gesture.identifier);
    if (!touch) {
      return;
    }
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (
        Math.abs(dx) < DIRECTION_LOCK_PX &&
        Math.abs(dy) < DIRECTION_LOCK_PX
      ) {
        return;
      }
      if (Math.abs(dx) <= Math.abs(dy)) {
        // 縦の操作。以後はブラウザのスクロールに任せる
        gestureRef.current = null;
        return;
      }
      gesture.horizontal = true;
      alignPeeks();
    }
    // 横に動かしている間は、縦にスクロールさせない
    if (event.cancelable) {
      event.preventDefault();
    }
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) {
      gesture.velocity = (touch.clientX - gesture.lastX) / elapsed;
    }
    gesture.lastX = touch.clientX;
    gesture.lastTime = event.timeStamp;
    gesture.offset =
      neighborFor(dx, gesture.rtl) === null ? dx * EDGE_RESISTANCE : dx;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${gesture.offset}px, 0, 0)`;
    }
  });

  const handleTouchEnd = useEffectEvent((event: TouchEvent) => {
    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }
    const touch = findTouch(event.changedTouches, gesture.identifier);
    if (!touch) {
      return;
    }
    gestureRef.current = null;
    if (!gesture.horizontal) {
      return;
    }
    // 横に動かした指を離したときのクリックは、カードを開く操作にしない
    suppressClickRef.current = true;
    const dx = touch.clientX - gesture.startX;
    const targetKey = neighborFor(dx, gesture.rtl);
    const width = panelRef.current?.clientWidth ?? 0;
    const distance = Math.abs(dx);
    const passedDistance = distance > Math.min(width * COMMIT_RATIO, COMMIT_MAX_PX);
    const flicked =
      distance > FLICK_MIN_PX &&
      Math.abs(gesture.velocity) > FLICK_VELOCITY_PX_PER_MS &&
      Math.sign(gesture.velocity) === Math.sign(dx);
    if (targetKey !== null && (passedDistance || flicked)) {
      commit(targetKey, gesture.offset, dx);
    } else {
      settle(gesture.offset);
    }
  });

  const handleTouchCancel = useEffectEvent(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.horizontal) {
      settle(gesture.offset);
    }
  });

  /*
    タッチは addEventListener で直接受ける。React の onTouchMove は passive で登録されるため、
    横に動かしている間の縦スクロールを止められない(preventDefault が効かない)。
  */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const onStart = (event: TouchEvent) => handleTouchStart(event);
    const onMove = (event: TouchEvent) => handleTouchMove(event);
    const onEnd = (event: TouchEvent) => handleTouchEnd(event);
    const onCancel = () => handleTouchCancel();
    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onCancel);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onCancel);
    };
  }, []);

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) {
      return;
    }
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /*
    並べる一覧: 前のタブ(見本)・選択中のタブ・次のタブ(見本)。
    ⭐ key はタブの ID。切り替えても同じタブの入れ物は作り直されず、役割だけが変わる
    (隣の見本 → 今の一覧)。並びの順序は描く順と関係ない(見本は absolute で左右に置く)。
  */
  const slots: { key: K; role: "previous" | "current" | "next" }[] = [];
  if (peeksMounted && previousKey !== null) {
    slots.push({ key: previousKey, role: "previous" });
  }
  slots.push({ key: activeKey, role: "current" });
  if (peeksMounted && nextKey !== null) {
    slots.push({ key: nextKey, role: "next" });
  }

  return (
    <div
      ref={panelRef}
      data-testid="catalog-swipe-panel"
      // -mx-4 px-4: 本文の左右余白(px-4)の外まで広げ、ずらした一覧を画面の端で切る。
      // overflow-clip: ずらした一覧と、横に並べた隣のタブの一覧をこの領域で切る
      // (画面が横にスクロールしたり、隣の一覧の分だけページが縦に伸びたりしないように。
      // hidden と違ってスクロール領域を作らないので、中の sticky などに影響しない)。
      // min-h: 固定したタブ列(帯と下の余白で約 4rem)より下を、一覧が短くても埋める。
      // カードが少ないタブや 0 件のタブでも、画面の下のほうを払って切り替えられるようにするため
      // (切り替えのたびにページの高さが大きく変わって、スクロール位置が飛ぶのも防ぐ)
      className="-mx-4 min-h-[calc(100dvh-4rem)] overflow-clip px-4"
      style={{ touchAction: "pan-y pinch-zoom" }}
      onClickCapture={handleClickCapture}
    >
      {/* 今の一覧と、左右に並べた隣のタブの一覧。払っている間はこの並びごと動かす */}
      <div ref={trackRef} className="relative">
        {slots.map(({ key, role }) =>
          role === "current" ? (
            <div key={key} ref={contentRef} data-testid="catalog-swipe-current">
              {renderTab(key, "page")}
            </div>
          ) : (
            <div
              key={key}
              ref={role === "previous" ? previousPeekRef : nextPeekRef}
              data-testid={`catalog-swipe-peek-${role}`}
              aria-hidden="true"
              inert
              className="absolute top-0 w-full"
              style={
                role === "previous"
                  ? { insetInlineEnd: `calc(100% + ${PAGE_GAP_PX}px)` }
                  : { insetInlineStart: `calc(100% + ${PAGE_GAP_PX}px)` }
              }
            >
              {renderTab(key, "peek")}
            </div>
          )
        )}
      </div>
    </div>
  );
}
