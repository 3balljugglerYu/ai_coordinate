import Link from "next/link";
import {
  Coins,
  Flag,
  ImageIcon,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardQuickAction } from "../lib/dashboard-types";

const iconMap = {
  dashboard: LayoutDashboard,
  search: Search,
  "shield-check": ShieldCheck,
  coins: Coins,
  wallet: Wallet,
  image: ImageIcon,
  flag: Flag,
} as const;

interface AdminQuickActionsGridProps {
  actions: DashboardQuickAction[];
}

export function AdminQuickActionsGrid({
  actions,
}: AdminQuickActionsGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action) => {
        const Icon =
          iconMap[action.iconKey as keyof typeof iconMap] ?? LayoutDashboard;

        return (
          <Link key={action.href} href={action.href} className="block">
            <Card
              className={cn(
                "h-full border-violet-200/60 bg-white/95 shadow-sm transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
              )}
            >
              <CardContent className="flex h-full items-start gap-4 p-4 sm:p-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {action.label}
                  </p>
                  <p className="text-sm leading-6 text-slate-600">
                    {action.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
