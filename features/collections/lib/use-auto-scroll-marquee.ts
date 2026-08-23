"use client";

import { useEffect, useRef } from "react";

/**
 * 「自動で流れるが、指でも動かせる」棚。
 *
 * ## なぜ transform ではなく scrollLeft を動かすのか
 *
 * 以前は `transform: translateX(0 → -50%)` の CSS アニメーションで流していた。
 * 見た目は動くが、**外側が `overflow-hidden` なのでスクロール領域ではなく、
 * 指でドラッグしても何も起きなかった**(実機で報告された)。
 * 動いているものは触れば動かせる、と期待するのが自然なので、
 * **本物のスクロールを動かす**方式に変える。
 *
 * これなら
 * - 指でもホイールでも動かせる(ブラウザ本来のスクロール)
 * - 慣性スクロールもそのまま効く
 * - 触っていないときは自動で流れる
 *
 * ## 触っているあいだは止める(が、`:hover` では止めない)
 *
 * 以前は CSS の `:hover` で止めていたが、**スマホでは hover がタップ後も
 * 残る**ため、指を離しても止まったままになり、別の場所を触るまで再開
 * しなかった。ここでは「操作があったら止めて、一定時間たったら再開」に
 * 変える。マウスでもタッチでも同じ挙動になる。
 *
 * ## 継ぎ目
 *
 * 呼び出し側が中身を2周ぶん並べておく前提。折り返し地点(全体の半分)を
 * 越えたら半分ぶん引き戻す。中身が同一なので見た目は途切れない。
 * 逆方向へ戻したときも同じように送る。
 */

export interface AutoScrollMarqueeOptions {
  /** 自動で流すか。件数が少ない・reduced-motion のときは false。 */
  enabled: boolean;
  /** 流れる速さ(px/秒)。読みながら追える程度に遅くする。 */
  speedPxPerSec?: number;
  /** 最後の操作から再開するまでの待ち(ms)。 */
  resumeDelayMs?: number;
}

const DEFAULT_SPEED_PX_PER_SEC = 24;
const DEFAULT_RESUME_DELAY_MS = 2500;

export function useAutoScrollMarquee<T extends HTMLElement>({
  enabled,
  speedPxPerSec = DEFAULT_SPEED_PX_PER_SEC,
  resumeDelayMs = DEFAULT_RESUME_DELAY_MS,
}: AutoScrollMarqueeOptions) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    // 動きを減らす設定の人には自動で流さない(手動スクロールは残る)
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    if (reduceMotion?.matches) return;

    let rafId = 0;
    /*
      前フレームの時刻。**0 と「まだ無い」を区別する**ために null 始まり。
      `lastTs ? ... : 0` と書くと、最初の時刻がちょうど 0 のときに
      経過時間が出せず、次のフレームまで進まない。
    */
    let lastTs: number | null = null;
    let resumeTimer = 0;
    /** 操作中は止める。指を離してしばらくしたら戻す。 */
    let paused = false;
    /**
     * 自分が進めたぶんの位置(小数)。
     *
     * ブラウザによっては `scrollLeft` への代入が整数に丸められる。
     * 毎フレーム 0.4px ずつ足しても丸められて 0 のままになり、**まったく
     * 進まない**ことがあるため、小数はこちらで持ち越す。
     */
    let position = 0;
    /**
     * 直前に自分が設定した `scrollLeft`。
     *
     * ⭐ ここと実際の値がずれていたら、**自分以外の何かが動かした**。
     * iOS の慣性スクロールは指を離したあとも流れ続け、touchstart のような
     * イベントを出さないので、イベントだけを見ていると
     * **慣性の最中に自動送りが割り込む**。位置で見れば、慣性・手動ドラッグ・
     * スクロールバー・キーボードのすべてを一律に拾える。
     */
    let ownScrollLeft: number | null = null;
    /**
     * 画面に入っているあいだだけ動かす。
     * 出ているうちに流れていると、たどり着いたときには途中から始まって
     * しまう(先頭のコーデが見えない)。電池の無駄でもある。
     */
    let visible = false;

    const pause = () => {
      paused = true;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        paused = false;
      }, resumeDelayMs);
    };

    /**
     * 折り返し。中身は2周ぶん並んでいるので、半分で送り返す。
     * **手動スクロール用**(自動送りの折り返しは tick 内で小数のまま行う)。
     */
    const wrap = () => {
      const half = el.scrollWidth / 2;
      if (half <= 0) return;
      if (el.scrollLeft >= half) {
        el.scrollLeft -= half;
      } else if (el.scrollLeft < 0) {
        el.scrollLeft += half;
      }
    };

    const tick = (ts: number) => {
      rafId = window.requestAnimationFrame(tick);
      const delta = lastTs === null ? 0 : (ts - lastTs) / 1000;
      lastTs = ts;

      /*
        自分が置いた位置と違う = 誰かが動かした(慣性・指・ホイール等)。
        止めたうえで、そこを新しい起点にする。
      */
      if (ownScrollLeft !== null && Math.abs(el.scrollLeft - ownScrollLeft) > 1) {
        ownScrollLeft = null;
        pause();
      }

      if (paused || !visible) {
        // 止まっているあいだの手動移動を持ち越さない
        ownScrollLeft = null;
        return;
      }

      if (ownScrollLeft === null) {
        position = el.scrollLeft;
      }
      position += speedPxPerSec * delta;

      /*
        折り返しは**小数のまま**行う。`el.scrollLeft` を読み直して
        position に入れると、丸めるブラウザでは端数が毎フレーム捨てられ、
        遅い速度(24px/秒 = 1フレーム 0.4px)でまったく進まなくなる。
      */
      const half = el.scrollWidth / 2;
      if (half > 0) {
        if (position >= half) position -= half;
        else if (position < 0) position += half;
      }

      el.scrollLeft = position;
      // 丸められた実際の値を控える(次フレームの比較の基準)
      ownScrollLeft = el.scrollLeft;
    };

    // 手動スクロール後も折り返しを効かせる(端で止まらないように)
    const onScroll = () => wrap();

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(el);

    el.addEventListener("pointerdown", pause);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("keydown", pause);
    el.addEventListener("scroll", onScroll, { passive: true });

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(resumeTimer);
      io.disconnect();
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("wheel", pause);
      el.removeEventListener("keydown", pause);
      el.removeEventListener("scroll", onScroll);
    };
  }, [enabled, speedPxPerSec, resumeDelayMs]);

  return ref;
}
