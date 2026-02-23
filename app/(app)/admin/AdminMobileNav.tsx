"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  Coins,
  ImageIcon,
  Search,
  FileText,
  Flag,
  Wallet,
  RectangleHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/admin", label: "ダッシュボード", icon: LayoutDashboard },
  { path: "/admin/users", label: "ユーザー検索", icon: Search },
  { path: "/admin/moderation", label: "投稿審査", icon: ShieldCheck },
  { path: "/admin/bonus", label: "ボーナス", icon: Coins },
  { path: "/admin/banners", label: "バナー管理", icon: RectangleHorizontal },
  { path: "/admin/image-optimization", label: "画像最適化", icon: ImageIcon },
  { path: "/admin/audit-log", label: "操作ログ", icon: FileText },
  { path: "/admin/reports", label: "通報一覧", icon: Flag },
  { path: "/admin/credits-summary", label: "ペルコイン集計", icon: Wallet },
] as const;

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden pb-4 mb-4 border-b border-violet-200/40"
      aria-label="管理画面ナビゲーション（モバイル）"
    >
      <div className="flex gap-2 overflow-x-auto py-2 -mx-1 scroll-smooth">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive =
            path === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(path);
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium min-h-[44px] transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
                isActive
                  ? "bg-violet-100 text-violet-800"
                  : "bg-white/80 text-slate-600 hover:bg-violet-50/80 hover:text-slate-900 border border-violet-200/40"
              )}
              aria-current={isActive ? "page" : undefined}
              aria-label={label}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
