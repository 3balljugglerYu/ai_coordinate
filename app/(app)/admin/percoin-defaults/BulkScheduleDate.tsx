"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 「この範囲の項目に、同じ切替日時を入れる」ための小さな操作。
 *
 * 全体用とセクション用で同じ部品を使う。額の有無に関わらず日時を入れる
 * （額を先に入れる必要があると、順番を強いることになって使いにくい）。
 * 額が入っていない予約は保存時にまとめて指摘する。
 */
export function BulkScheduleDate({
  id,
  label,
  value,
  onChange,
  onApply,
  disabled,
}: {
  id: string;
  /** 「どこに入るのか」が分かる文言。例: この3項目に入れる */
  label: string;
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={id} className="text-xs text-slate-600">
        まとめて日時を入れる
      </Label>
      <Input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-[210px] bg-white"
        disabled={disabled}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-9"
        onClick={onApply}
        disabled={disabled || !value}
      >
        {label}
      </Button>
    </div>
  );
}
