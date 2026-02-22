"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";
import { LayoutDashboard, ExternalLink } from "lucide-react";

export function AdminHeader() {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateHeight = () => {
      const height = headerRef.current?.offsetHeight ?? 64;
      document.documentElement.style.setProperty("--admin-header-height", `${height}px`);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-30 h-16 border-b border-violet-200/60 bg-white/95 backdrop-blur-xl shadow-sm"
      role="banner"
      aria-label="管理画面ヘッダー"
    >
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-violet-800 hover:text-violet-600 transition-colors duration-200"
          aria-label="管理ダッシュボードへ"
        >
          <LayoutDashboard className="h-6 w-6" aria-hidden />
          <span className="font-semibold text-lg">Persta 管理</span>
        </Link>

        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-violet-50/80 hover:text-violet-700 transition-colors duration-200"
          aria-label="サイトトップへ戻る"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          <span>サイトへ戻る</span>
        </Link>
      </div>
    </header>
  );
}
