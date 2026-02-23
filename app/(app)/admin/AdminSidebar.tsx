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
  ChevronLeft,
  ChevronRight,
  RectangleHorizontal,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/admin", label: "ダッシュボード", icon: LayoutDashboard },
  { path: "/admin/users", label: "ユーザー検索", icon: Search },
  { path: "/admin/moderation", label: "投稿審査", icon: ShieldCheck },
  { path: "/admin/bonus", label: "ボーナス付与", icon: Coins },
  { path: "/admin/credits-summary", label: "ペルコイン集計", icon: Wallet },
  { path: "/admin/banners", label: "バナー管理", icon: RectangleHorizontal },
  { path: "/admin/image-optimization", label: "画像最適化", icon: ImageIcon },
  { path: "/admin/audit-log", label: "操作ログ", icon: FileText },
  { path: "/admin/reports", label: "通報一覧", icon: Flag },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--admin-sidebar-width",
      collapsed ? "80px" : "256px"
    );
    return () => {
      document.documentElement.style.removeProperty("--admin-sidebar-width");
    };
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-[var(--admin-header-height,64px)] bottom-0 z-20 hidden lg:flex flex-col border-r border-violet-200/60 bg-white/90 backdrop-blur-xl shadow-lg transition-[width] duration-200",
        collapsed ? "w-20" : "w-64"
      )}
      aria-label="管理画面ナビゲーション"
    >
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3" role="list">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive =
              path === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(path);
            return (
              <li key={path}>
                <Link
                  href={path}
                  className={cn(
                    "flex items-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200 min-h-[44px]",
                    collapsed ? "justify-center px-0 w-full" : "gap-3 px-3",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
                    "hover:bg-violet-50/80",
                    isActive
                      ? "bg-violet-100 text-violet-800"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={label}
                  title={collapsed ? label : undefined}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-transform duration-200",
                      isActive ? "text-violet-600" : "text-slate-500"
                    )}
                    aria-hidden
                  />
                  {!collapsed && (
                    <span className="truncate">{label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-violet-200/60 p-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "flex items-center justify-center w-full h-11 rounded-lg text-slate-500 hover:bg-violet-50/80 hover:text-violet-700 transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          )}
          aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" aria-hidden />
          ) : (
            <ChevronLeft className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
    </aside>
  );
}
