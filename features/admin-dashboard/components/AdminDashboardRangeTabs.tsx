import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  buildAdminDashboardHref,
  type AdminDashboardTab,
} from "../lib/dashboard-tab";
import { DASHBOARD_RANGE_OPTIONS, type DashboardRange } from "../lib/dashboard-range";

interface AdminDashboardRangeTabsProps {
  currentRange: DashboardRange;
  currentTab: AdminDashboardTab;
}

export function AdminDashboardRangeTabs({
  currentRange,
  currentTab,
}: AdminDashboardRangeTabsProps) {
  return (
    <div
      className="w-full max-w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:w-auto"
    >
      <nav
        className="inline-flex min-w-max rounded-xl border border-violet-200/70 bg-white/95 p-1 shadow-sm"
        aria-label="表示期間"
      >
        {DASHBOARD_RANGE_OPTIONS.map((option) => {
          const isActive = option.value === currentRange;

          return (
            <Link
              key={option.value}
              href={buildAdminDashboardHref({
                range: option.value,
                tab: currentTab,
              })}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
                "min-h-11 min-w-[64px] text-center",
                isActive
                  ? "bg-violet-600 text-white"
                  : "text-slate-600 hover:bg-violet-50 hover:text-violet-700"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
