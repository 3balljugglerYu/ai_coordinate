"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  Coins,
  MinusCircle,
  ImageIcon,
  Search,
  FileText,
  Flag,
  Wallet,
  RectangleHorizontal,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adminNavItems,
  type AdminNavIconKey,
} from "./admin-nav-items";

const iconMap: Record<AdminNavIconKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  search: Search,
  "shield-check": ShieldCheck,
  coins: Coins,
  settings: Settings,
  "minus-circle": MinusCircle,
  wallet: Wallet,
  "rectangle-horizontal": RectangleHorizontal,
  image: ImageIcon,
  "file-text": FileText,
  flag: Flag,
};

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden pb-4 mb-4 border-b border-violet-200/40"
      aria-label="管理画面ナビゲーション（モバイル）"
    >
      <div className="flex gap-2 overflow-x-auto py-2 -mx-1 scroll-smooth">
        {adminNavItems.map(({ path, label, iconKey }) => {
          const Icon = iconMap[iconKey];
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
