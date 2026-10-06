"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface FloatingGuideCtaProps {
  href: string;
  label: string;
  /** この要素が画面に入ったら、浮かぶボタンを隠す(その場所に同じボタンがある) */
  dockTargetId: string;
}

/**
 * 紹介ページの「ガチャをつくってみる」を、どこまで読んでいても押せるよう画面の下に浮かべる
 * (2026-10-06 ユーザー指示)。
 *
 * 締めの章まで来たら隠し、その章のボタンに任せる。浮かべたままだと、ページの一番下で
 * フッターのリンク(プライバシーポリシーなど)に重なって押せなくなるため。
 * スマホは下のメニュー(高さ 4rem + セーフエリア)の上、パソコンは右下に置く。
 */
export function FloatingGuideCta({ href, label, dockTargetId }: FloatingGuideCtaProps) {
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const target = document.getElementById(dockTargetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setDocked(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [dockTargetId]);

  return (
    <Link
      href={href}
      data-testid="gacha-guide-floating-cta"
      data-docked={docked ? "true" : "false"}
      aria-hidden={docked || undefined}
      tabIndex={docked ? -1 : undefined}
      className={cn(
        "fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-300 px-8 py-3.5 text-base font-extrabold text-gray-900 shadow-[0_6px_20px_rgba(27,29,42,0.28)] transition-opacity duration-200 motion-reduce:transition-none",
        "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-slate-900",
        "lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0 lg:px-10 lg:py-4 lg:text-lg",
        docked && "pointer-events-none opacity-0",
      )}
    >
      {label}
    </Link>
  );
}
