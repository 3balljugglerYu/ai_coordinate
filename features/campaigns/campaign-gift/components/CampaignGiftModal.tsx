"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_GIFT_TAPS_TO_OPEN,
  type CampaignGiftClaimResult,
  type CampaignGiftCloseKind,
} from "../campaign-gift";
import styles from "./campaign-gift.module.css";

/**
 * 企画の贈り物の画面(2026-10-26 ユーザー決定)。
 *
 * 見本(タップできる3案)から「案A ゆれる」に決まり、次の直しが入った:
 * - タップするたびに15%ずつ大きくなる(4回目で1.6倍)
 * - 5回目は、ふくらみながら激しくゆれ、金色の大きな光と回る光の筋のなかで、ふたが飛んでペルコインが50枚あふれ出る
 * - コインはアプリのペルコインの絵(/percoin.png)、真ん中は購入画面の束の絵(/percoin/percoin3.webp)
 * - 開ける前は中身(ペルコイン)を書かない(「ワクワクが半減」)
 * 動きを減らす設定の人には、ゆれ・光・飛び出すコインを出さない。
 */

const COIN_SRC = "/percoin.png";
const PILE_SRC = "/percoin/percoin3.webp";
/** 5回目のふくらむ時間(受け取りの返事を待つ時間を兼ねる) */
const CHARGE_MS = 500;
const COIN_BURSTS = [32, 18] as const;
const SECOND_BURST_DELAY_MS = 220;
const REVEAL_DELAY_MS = 380;
const COUNT_UP_MS = 900;

const PRIMARY_BUTTON_CLASS =
  "flex min-h-[48px] w-full items-center justify-center rounded-full text-base font-bold text-white";
const PRIMARY_BUTTON_STYLE: CSSProperties = {
  backgroundImage: "linear-gradient(90deg, #7b3fe4 0%, #ff7a1a 50%, #7b3fe4 100%)",
  backgroundSize: "200% 100%",
};

type Phase = "tapping" | "opening" | "revealed" | "already" | "closed" | "auth" | "error";

export interface CampaignGiftModalProps {
  open: boolean;
  /**
   * 閉じた。kind は閉じたときの覚え方(campaign-gift.ts の CampaignGiftCloseKind)。
   * 受け取りの途中は閉じられない
   */
  onClose: (kind: CampaignGiftCloseKind) => void;
  signedIn: boolean;
  /** 贈る額(DB の campaign_gifts から) */
  amount: number;
  /** 期限の表示(例: 10月31日 23:59) */
  expireLabel: string | null;
  /** 期限の日付の短い表示(例: 10/31)。5回タップしたあとの説明に使う */
  expireShortLabel: string | null;
  /** 受け取る(ログインしている人だけ呼ぶ) */
  onClaim: () => Promise<CampaignGiftClaimResult>;
  /** 受け取ったあと(残高の表示を新しくするなど) */
  onClaimed?: () => void;
  loginHref: string;
  worksHref: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Coin = {
  el: HTMLImageElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  delay: number;
  life: number;
  gone: boolean;
};

/** 見本は 60Hz の1コマを1として作った。画面の書き換えの速さによらず同じ速さで動くよう、経った時間をコマに直す */
const FRAME_MS = 1000 / 60;
const GRAVITY = 0.32;
const COIN_LIFE_FRAMES = 95;

export function CampaignGiftModal({
  open,
  onClose,
  signedIn,
  amount,
  expireLabel,
  expireShortLabel,
  onClaim,
  onClaimed,
  loginHref,
  worksHref,
}: CampaignGiftModalProps) {
  const [taps, setTaps] = useState(0);
  const [phase, setPhase] = useState<Phase>("tapping");
  const [finale, setFinale] = useState(false);
  const [count, setCount] = useState(0);
  const giftRef = useRef<HTMLButtonElement | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const coinsRef = useRef<Coin[]>([]);
  const rafRef = useRef(0);
  const countRafRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(countRafRef.current);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // ペルコインがあふれ出る(放物線で飛んで、落ちながら消える)。飛んでいるコインは1つの一覧で動かす
  const burstCoins = useCallback((n: number) => {
    const fx = fxRef.current;
    const gift = giftRef.current;
    if (!fx || !gift) return;
    const rect = gift.getBoundingClientRect();
    const ox = rect.left + rect.width / 2;
    const oy = rect.top + rect.height * 0.45;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("img");
      el.src = COIN_SRC;
      el.alt = "";
      const size = 22 + Math.random() * 22;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.opacity = "0";
      fx.appendChild(el);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = 5 + Math.random() * 7;
      coinsRef.current.push({
        el,
        x: ox - size / 2,
        y: oy - size / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: Math.random() * 360,
        vr: (Math.random() - 0.5) * 22,
        delay: Math.floor(Math.random() * 12),
        life: 0,
        gone: false,
      });
    }
    if (rafRef.current) return;
    let last = performance.now();
    const step = (now: number) => {
      // 経ったコマ数(タブが裏に回ったときなどに、一度に飛びすぎないよう 3 コマまで)
      const dt = Math.min((now - last) / FRAME_MS, 3);
      last = now;
      let alive = false;
      for (const coin of coinsRef.current) {
        if (coin.gone) continue;
        if (coin.delay > 0) {
          coin.delay -= dt;
          alive = true;
          continue;
        }
        coin.life += dt;
        if (coin.life > COIN_LIFE_FRAMES) {
          coin.gone = true;
          coin.el.remove();
          continue;
        }
        alive = true;
        coin.vy += GRAVITY * dt;
        coin.x += coin.vx * dt;
        coin.y += coin.vy * dt;
        coin.r += coin.vr * dt;
        const fade = coin.life > COIN_LIFE_FRAMES - 25 ? (COIN_LIFE_FRAMES - coin.life) / 25 : 1;
        coin.el.style.opacity = String(fade);
        coin.el.style.transform = `translate(${coin.x}px, ${coin.y}px) rotate(${coin.r}deg)`;
      }
      if (alive) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
        coinsRef.current = [];
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const countUp = useCallback((target: number) => {
    if (prefersReducedMotion()) {
      setCount(target);
      return;
    }
    cancelAnimationFrame(countRafRef.current);
    const startedAt = performance.now();
    const tick = (now: number) => {
      const k = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      setCount(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) countRafRef.current = requestAnimationFrame(tick);
    };
    countRafRef.current = requestAnimationFrame(tick);
  }, []);

  const showFinale = useCallback(
    (value: number) => {
      if (prefersReducedMotion()) {
        setFinale(true);
        setPhase("revealed");
        countUp(value);
        return;
      }
      setFinale(true);
      burstCoins(COIN_BURSTS[0]);
      later(() => burstCoins(COIN_BURSTS[1]), SECOND_BURST_DELAY_MS);
      later(() => {
        setPhase("revealed");
        countUp(value);
      }, REVEAL_DELAY_MS);
    },
    [burstCoins, countUp, later],
  );

  const claim = useCallback(async () => {
    setPhase("opening");
    if (!signedIn) {
      await wait(prefersReducedMotion() ? 0 : CHARGE_MS);
      showFinale(amount);
      return;
    }
    const [result] = await Promise.all([
      onClaim().catch((): CampaignGiftClaimResult => ({ status: "error" })),
      wait(prefersReducedMotion() ? 0 : CHARGE_MS),
    ]);
    if (result.status === "granted") {
      trackCampaignEvent(CAMPAIGN_EVENTS.giftClaim);
      showFinale(result.amount);
      onClaimed?.();
    } else if (result.status === "already_claimed") {
      setPhase("already");
    } else if (result.status === "closed") {
      setPhase("closed");
    } else if (result.status === "auth_required") {
      setPhase("auth");
    } else {
      setPhase("error");
    }
  }, [amount, onClaim, onClaimed, showFinale, signedIn]);

  const handleTap = () => {
    if (phase !== "tapping") return;
    const next = taps + 1;
    setTaps(next);
    if (next >= CAMPAIGN_GIFT_TAPS_TO_OPEN) {
      // 「開けた」は5回目のタップで1回だけ数える(「もう一度受け取る」では数えない)
      trackCampaignEvent(CAMPAIGN_EVENTS.giftOpen);
      void claim();
      return;
    }
    // ゆれをもう一度動かす(React の className は変えずに、動きの名前だけを付け直す)
    const gift = giftRef.current;
    if (gift && !prefersReducedMotion()) {
      gift.classList.remove(styles.hit);
      void gift.offsetWidth;
      gift.classList.add(styles.hit);
    }
  };

  const scale = 1 + Math.min(taps, CAMPAIGN_GIFT_TAPS_TO_OPEN - 1) * 0.15;
  const amp = 4 + Math.min(taps, CAMPAIGN_GIFT_TAPS_TO_OPEN - 1) * 3;
  const tapsLeft = CAMPAIGN_GIFT_TAPS_TO_OPEN - taps;
  const revealed = phase === "revealed";

  let hint: string;
  if (revealed) hint = signedIn ? "受け取りました" : "ログインして受け取ろう";
  else if (phase === "opening") hint = "開けています…";
  else if (phase === "tapping") hint = `タップして開けてね（あと${tapsLeft}回）`;
  else hint = "";

  // 5回タップしたあとの説明(2026-10-26 ユーザー指定の文。2行)
  const limitedLabel = expireShortLabel ? `${expireShortLabel}までの限定ペルコイン` : "限定ペルコイン";
  let description: string;
  if (revealed && signedIn) {
    description = `${limitedLabel}GET！🪙\n気に入ったカタログを生成して応援しよう‼️`;
  } else if (revealed) {
    description = `ログインして、${limitedLabel}をGET！🪙\n気に入ったカタログを生成して応援しよう‼️`;
  } else if (phase === "already") {
    description = "この贈り物は、もう受け取っています。\n気に入ったカタログを生成して応援しよう‼️";
  } else if (phase === "closed") {
    description = "この贈り物の受け付けは、終わりました。";
  } else if (phase === "auth") {
    description = "ログインし直すと、受け取れます。";
  } else if (phase === "error") {
    description = "受け取れませんでした。通信のよい所で、もう一度お試しください。";
  } else {
    description = "ハロウィンだけの、特別な贈り物です。なにが入っているかは、開けてのお楽しみ！";
  }

  // 閉じたときの覚え方。受け取った・もう受け取っていた・受け付けが終わっていたときだけ、その端末でもう出さない
  let closeKind: CampaignGiftCloseKind;
  if (phase === "error" || phase === "auth") closeKind = "retry";
  else if ((revealed && signedIn) || phase === "already" || phase === "closed") closeKind = "done";
  else closeKind = "later";
  // 受け取りの途中(ふくらんでいる間)は閉じない。閉じると、受け取りの返事を待たずに画面が消え、二重に受け取ろうとしてしまう
  const close = () => {
    if (phase === "opening") return;
    onClose(closeKind);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-2xl border-0 p-0 outline-none sm:max-w-sm"
        // 外側を触っても閉じない(うっかり閉じると3時間出なくなるため。2026-10-27 ユーザー指示)。閉じるのは × と「あとで」・「閉じる」
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          giftRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className={cn(styles.top, "px-5 pb-4 pt-6 text-center text-white")}>
          <div aria-hidden="true" className={cn(styles.rays, finale && styles.raysOn)} />
          <div aria-hidden="true" className={cn(styles.flash, finale && styles.flashOn)} />
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/70"
            aria-label="閉じる"
          >
            ×
          </button>
          {/* タイトルは2行(2026-10-26 ユーザー指定) */}
          <DialogTitle className="relative z-[2] flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold tracking-[0.04em] text-[#ffc23d]">🎃ハロウィン ギフト🦇</span>
            <span className="text-xl font-black text-white">公式からの贈り物！</span>
          </DialogTitle>
          <div className={styles.stage}>
            <button
              ref={giftRef}
              type="button"
              onClick={handleTap}
              aria-label={revealed ? "開けたプレゼント" : `プレゼントをタップする（あと${tapsLeft}回）`}
              className={cn(
                styles.gift,
                phase === "opening" && styles.charge,
                finale && styles.open,
                finale && styles.gone,
              )}
              style={{ "--s": String(scale), "--amp": `${amp}deg` } as CSSProperties}
            >
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <ellipse cx="60" cy="112" rx="40" ry="5" fill="rgba(0,0,0,0.25)" />
                <rect x="16" y="54" width="88" height="56" rx="6" fill="#ff7a1a" />
                <rect x="16" y="54" width="88" height="10" fill="#e0620a" />
                <rect x="53" y="54" width="14" height="56" fill="#7b3fe4" />
                <g className={styles.lid}>
                  <rect x="10" y="40" width="100" height="16" rx="5" fill="#ff9a3d" />
                  <rect x="53" y="40" width="14" height="16" fill="#8f55f0" />
                  <path d="M60 40 C 44 18, 26 30, 40 40 Z" fill="#8f55f0" />
                  <path d="M60 40 C 76 18, 94 30, 80 40 Z" fill="#8f55f0" />
                  <circle cx="60" cy="38" r="6" fill="#ffc23d" />
                </g>
              </svg>
            </button>
            {revealed ? (
              <div className={styles.reveal} aria-live="polite">
                {/* eslint-disable-next-line @next/next/no-img-element -- 動きの中の飾りで、最適化の待ちを入れたくない */}
                <img className={styles.pile} src={PILE_SRC} alt="" />
                <p className={styles.amount}>
                  {count}
                  <span className="ml-0.5 text-base">ペルコイン</span>
                </p>
                {expireLabel ? (
                  <p className="text-xs font-bold text-[#ffc23d]">ハロウィン限定・{expireLabel} まで</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="relative z-[2] min-h-[1.25rem] text-sm text-white/85">{hint}</p>
          <div className="relative z-[2] mt-2 flex justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: CAMPAIGN_GIFT_TAPS_TO_OPEN }, (_, index) => (
              <span key={index} className={cn(styles.dot, index < taps && styles.dotOn)} />
            ))}
          </div>
        </div>

        <div className="relative z-[2] grid gap-2.5 bg-white px-5 pb-4 pt-4 text-center text-slate-700 [overflow-wrap:anywhere] [word-break:keep-all]">
          <DialogDescription className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{description}</DialogDescription>
          {revealed && signedIn ? (
            <Link
              href={worksHref}
              onClick={() => {
                trackCampaignEvent(CAMPAIGN_EVENTS.giftWorks);
                close();
              }}
              className={cn(PRIMARY_BUTTON_CLASS, styles.flow)}
              style={PRIMARY_BUTTON_STYLE}
            >
              対象作品を見る
            </Link>
          ) : null}
          {phase === "auth" ? (
            <Link href={loginHref} onClick={() => onClose("retry")} className={cn(PRIMARY_BUTTON_CLASS, styles.flow)} style={PRIMARY_BUTTON_STYLE}>
              ログインし直して受け取る
            </Link>
          ) : null}
          {revealed && !signedIn ? (
            <Link
              href={loginHref}
              onClick={() => {
                trackCampaignEvent(CAMPAIGN_EVENTS.giftLogin);
                // 受け取ろうとしている(「あとで」ではない)。ログインをやめても、別のページを開いたらまた出す
                onClose("retry");
              }}
              className={cn(PRIMARY_BUTTON_CLASS, styles.flow)}
              style={PRIMARY_BUTTON_STYLE}
            >
              ログインして受け取る
            </Link>
          ) : null}
          {phase === "already" ? (
            <Link
              href={worksHref}
              onClick={close}
              className={cn(PRIMARY_BUTTON_CLASS, styles.flow)}
              style={PRIMARY_BUTTON_STYLE}
            >
              対象作品を見る
            </Link>
          ) : null}
          {phase === "error" ? (
            <button type="button" onClick={() => void claim()} className={cn(PRIMARY_BUTTON_CLASS, styles.flow)} style={PRIMARY_BUTTON_STYLE}>
              もう一度受け取る
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="min-h-[40px] px-4 text-sm font-medium text-slate-500"
          >
            {phase === "tapping" || (revealed && !signedIn) ? "あとで" : "閉じる"}
          </button>
        </div>
        {/* あふれるコインは画面全体に重ねる(モーダルの枠の外まで飛ぶように)。開いている間だけ描くので document はある */}
        {typeof document !== "undefined"
          ? createPortal(<div ref={fxRef} className={styles.fx} aria-hidden="true" />, document.body)
          : null}
      </DialogContent>
    </Dialog>
  );
}
