"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * ペルコインの紹介ページで共有する部品。
 *
 * `/creator-rewards`(あげる側) と `/use-prompts`(つかう側) の2ページで使う。
 * 演出の実体は `app/globals.css` の `.reward-*` ユーティリティで、
 * `prefers-reduced-motion` のときは向こうで静止するようになっている。
 *
 * **色はページごとに違う**(暖色/寒色)。ここでは配色を決め打ちにせず、
 * 既定値を `/creator-rewards` の暖色に置いて、寒色のページだけが上書きする。
 * こうしておくと切り出しの前後で `/creator-rewards` の見た目が変わらない。
 */

/** プレースホルダの既定配色(= `/creator-rewards` の暖色)。 */
const DEFAULT_PLACEHOLDER_CLASS =
  "border-pink-300 bg-white/70 text-pink-400";

/**
 * 画像の枠。src が未指定(= 支給待ち)の間はプレースホルダを描く。
 * 画像が届いたら src を渡すだけで差し替わる。
 */
export function ImageSlot({
  src,
  alt,
  label,
  ratio,
  className,
  float = false,
  placeholderClassName = DEFAULT_PLACEHOLDER_CLASS,
}: {
  src?: string;
  alt: string;
  /** プレースホルダに出す説明(支給待ちの間だけ見える) */
  label: string;
  /** 例: "1 / 1", "9 / 16" */
  ratio: string;
  className?: string;
  /** chibi イラストをふわふわ浮かせる */
  float?: boolean;
  /** プレースホルダの枠線・背景・文字色 */
  placeholderClassName?: string;
}) {
  const floatClass = float ? "reward-float" : "";
  if (!src) {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className={`flex w-full items-center justify-center rounded-3xl border-[3px] border-dashed px-4 text-center text-xs font-bold leading-relaxed ${placeholderClassName} ${floatClass} ${className ?? ""}`}
      >
        {label}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={1024}
      height={1024}
      style={{ aspectRatio: ratio }}
      className={`w-full rounded-3xl object-contain ${floatClass} ${className ?? ""}`}
      sizes="(max-width: 640px) 100vw, 480px"
    />
  );
}

/**
 * スクショの最大幅を、**縦横比**から決める。
 *
 * 以前は「横長か縦長か」の二択で 300px / 190px にしていた。しかし縦長には
 * 二種類ある。
 *
 * - 端末まるごと(縦横比 2.2〜2.6)。広げると画面からはみ出すほど高くなる
 * - 画面の一部を切り出したもの(1.6 程度)。190px では文字が読めない
 *
 * 同じ「縦長」で扱うと、後者が読めないまま据え置かれる。**高さがどこまで
 * 伸びるか**で分ける。境目の 1.8 は、260px 幅で高さ 470px に収まる線。
 *
 * Tailwind の任意値クラスは静的な文字列でないと生成されないので、
 * 計算結果でクラス名を組み立てないこと(`max-w-[${n}px]` は効かない)。
 */
function resolveScreenshotWidth(width: number, height: number) {
  const ratio = height / width;
  if (ratio < 1) {
    // 横長。通知など、切り出した一部
    return { widthClass: "max-w-[300px]", sizes: "300px" };
  }
  if (ratio <= 1.8) {
    // 縦長だが、端末まるごとではない
    return { widthClass: "max-w-[260px]", sizes: "260px" };
  }
  // 端末まるごと。これ以上広げると高くなりすぎる
  return { widthClass: "max-w-[190px]", sizes: "190px" };
}

/**
 * 実際のアプリ画面のスクリーンショット。
 * イラストの下に添えて「本当にこの画面でやるんだ」と伝わるようにする。
 * 端末の画面らしく見えるよう白フチ＋角丸で囲む。
 */
export function ScreenshotSlot({
  src,
  alt,
  caption,
  width,
  height,
  placeholderClassName = DEFAULT_PLACEHOLDER_CLASS,
}: {
  src?: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  placeholderClassName?: string;
}) {
  const { widthClass, sizes } = resolveScreenshotWidth(width, height);
  return (
    <figure className={`mx-auto mt-5 w-full ${widthClass}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className="w-full rounded-2xl border-4 border-white shadow-[0_6px_0_rgba(0,0,0,0.06)]"
        />
      ) : (
        <div
          style={{ aspectRatio: `${width} / ${height}` }}
          className={`flex w-full items-center justify-center rounded-2xl border-[3px] border-dashed px-3 text-center text-[10px] font-bold leading-relaxed ${placeholderClassName}`}
        >
          {caption}（支給待ち）
        </div>
      )}
      <figcaption className="mt-2 text-center text-[11px] font-bold text-gray-500">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * 画面に入ったら「ぽん」と跳ねて現れる。
 * 従来のスライド+フェードより、勢いのあるポップな出方にする。
 */
export function PopIn({
  children,
  delay = 0,
  rotate = -4,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  /** 出てくるときの傾き(度)。連続配置で交互にすると賑やかになる */
  rotate?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${shown ? "reward-pop-in" : "opacity-0"} ${className ?? ""}`}
      style={
        {
          animationDelay: `${delay}ms`,
          "--reward-pop-rotate": `${rotate}deg`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** 装飾のキラキラ。読み物の余白に散らして賑やかさを出す。 */
export function Sparkle({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute reward-sparkle select-none ${className ?? ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      ✨
    </span>
  );
}
