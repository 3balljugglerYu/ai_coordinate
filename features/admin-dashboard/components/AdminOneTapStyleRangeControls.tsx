"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ONE_TAP_STYLE_DASHBOARD_RANGE_OPTIONS,
  type DashboardRange,
  type OneTapStyleDashboardRange,
} from "../lib/dashboard-range";
import { buildAdminDashboardHref } from "../lib/dashboard-tab";

interface AdminOneTapStyleRangeControlsProps {
  currentRange: DashboardRange;
  currentStyleRange: OneTapStyleDashboardRange;
  currentStyleFrom: string | null;
  currentStyleTo: string | null;
  currentStyleFromLabel: string;
  currentStyleToLabel: string;
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AdminOneTapStyleRangeControls({
  currentRange,
  currentStyleRange,
  currentStyleFrom,
  currentStyleTo,
  currentStyleFromLabel,
  currentStyleToLabel,
}: AdminOneTapStyleRangeControlsProps) {
  const router = useRouter();
  const [fromValue, setFromValue] = useState(() =>
    toDateTimeLocalValue(currentStyleFrom)
  );
  const [toValue, setToValue] = useState(() =>
    toDateTimeLocalValue(currentStyleTo)
  );

  const hasValidCustomInputs = useMemo(() => {
    if (!fromValue || !toValue) {
      return false;
    }

    return new Date(fromValue).getTime() < new Date(toValue).getTime();
  }, [fromValue, toValue]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasValidCustomInputs) {
      return;
    }

    const styleFrom = new Date(fromValue).toISOString();
    const styleTo = new Date(toValue).toISOString();

    router.push(
      buildAdminDashboardHref({
        range: currentRange,
        tab: "one-tap-style",
        styleRange: "custom",
        styleFrom,
        styleTo,
      })
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200/70 bg-white/95 p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">集計期間</p>
        <p className="text-xs leading-5 text-slate-600">
          既定の期間に加えて、一般公開後など任意の開始・終了日時で集計できます。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ONE_TAP_STYLE_DASHBOARD_RANGE_OPTIONS.map((option) => {
          const isActive = option.value === currentStyleRange;
          return (
            <Link
              key={option.value}
              href={buildAdminDashboardHref({
                range: currentRange,
                tab: "one-tap-style",
                styleRange: option.value,
                ...(option.value === "custom"
                  ? {
                      styleFrom: currentStyleFrom,
                      styleTo: currentStyleTo,
                    }
                  : {}),
              })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="style-range-from">開始日時</Label>
          <Input
            id="style-range-from"
            type="datetime-local"
            value={fromValue}
            onChange={(event) => setFromValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="style-range-to">終了日時</Label>
          <Input
            id="style-range-to"
            type="datetime-local"
            value={toValue}
            onChange={(event) => setToValue(event.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={!hasValidCustomInputs}>
            カスタム期間を適用
          </Button>
        </div>
      </form>
      {currentStyleRange === "custom" ? (
        <p className="text-xs text-slate-500">
          現在の custom 期間:
          {" "}
          {currentStyleFromLabel}
          {" "}
          〜
          {" "}
          {currentStyleToLabel}
        </p>
      ) : null}
    </div>
  );
}
