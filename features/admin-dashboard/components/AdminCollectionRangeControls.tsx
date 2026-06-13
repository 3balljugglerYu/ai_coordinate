"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CUSTOM_DASHBOARD_RANGE_OPTIONS,
  type CustomDashboardRange,
  type DashboardRange,
} from "../lib/dashboard-range";
import { buildAdminDashboardHref } from "../lib/dashboard-tab";

interface AdminCollectionRangeControlsProps {
  globalRange: DashboardRange;
  currentRange: CustomDashboardRange;
  currentFrom: string | null;
  currentTo: string | null;
  currentFromLabel: string;
  currentToLabel: string;
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

export function AdminCollectionRangeControls({
  globalRange,
  currentRange,
  currentFrom,
  currentTo,
  currentFromLabel,
  currentToLabel,
}: AdminCollectionRangeControlsProps) {
  const router = useRouter();
  const [selectedRange, setSelectedRange] =
    useState<CustomDashboardRange>(currentRange);
  // SSR/CSR の Hydration Mismatch を避けるため、ローカル時刻(getTimezoneOffset)に
  // 依存する初期値は使わず、マウント後の useEffect(下) で設定する。
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");

  useEffect(() => {
    setSelectedRange(currentRange);
  }, [currentRange]);

  useEffect(() => {
    setFromValue(toDateTimeLocalValue(currentFrom));
  }, [currentFrom]);

  useEffect(() => {
    setToValue(toDateTimeLocalValue(currentTo));
  }, [currentTo]);

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

    const collectionFrom = new Date(fromValue).toISOString();
    const collectionTo = new Date(toValue).toISOString();

    router.push(
      buildAdminDashboardHref({
        range: globalRange,
        tab: "collections",
        collectionRange: "custom",
        collectionFrom,
        collectionTo,
      }),
    );
  }

  function handleRangeSelect(nextRange: CustomDashboardRange) {
    if (nextRange === "custom") {
      setSelectedRange("custom");
      return;
    }

    setSelectedRange(nextRange);
    router.push(
      buildAdminDashboardHref({
        range: globalRange,
        tab: "collections",
        collectionRange: nextRange,
      }),
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200/70 bg-white/95 p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">集計期間</p>
        <p className="text-xs leading-5 text-slate-600">
          既定の期間に加えて、企画の開催期間など任意の開始・終了日時で集計できます。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CUSTOM_DASHBOARD_RANGE_OPTIONS.map((option) => {
          const isActive = option.value === selectedRange;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleRangeSelect(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <form
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1.5">
          <Label htmlFor="collection-range-from">開始日時</Label>
          <Input
            id="collection-range-from"
            type="datetime-local"
            value={fromValue}
            onChange={(event) => setFromValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collection-range-to">終了日時</Label>
          <Input
            id="collection-range-to"
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
      {currentRange === "custom" ? (
        <p className="text-xs text-slate-500">
          現在の custom 期間: {currentFromLabel} 〜 {currentToLabel}
        </p>
      ) : null}
    </div>
  );
}
