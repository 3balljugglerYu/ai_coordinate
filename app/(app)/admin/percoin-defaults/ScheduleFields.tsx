"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resolveScheduleState } from "@/features/credits/lib/percoin-schedule";

/**
 * 1 行ぶんの「予約」入力（予約額 + 切替日時 + 解除）。
 *
 * ここで一番避けたい間違いは 2 つ。
 *  - 額だけ入れて日時を忘れる（保存できず、なぜ弾かれたか分からない）
 *  - 切替済みなのに現在額の欄を見て「まだ 20 のはず」と誤解する
 *
 * どちらも**その場で状態を文字にして出す**ことで防ぐ。
 */

export interface ScheduleInput {
  /** 予約額。空文字は「未入力」 */
  amount: string;
  /** 切替日時（datetime-local の値・JST） */
  at: string;
}

interface Props {
  /** いまテーブルに入っている額（切替前の値） */
  currentAmount: number;
  /** 保存済みの予約（切替済みかどうかの表示に使う） */
  savedSchedule: { scheduledAmount: number | null; scheduledAt: string | null };
  value: ScheduleInput;
  onChange: (next: ScheduleInput) => void;
  min: number;
  max: number;
  disabled?: boolean;
  idPrefix: string;
}

export function ScheduleFields({
  currentAmount,
  savedSchedule,
  value,
  onChange,
  min,
  max,
  disabled,
  idPrefix,
}: Props) {
  const savedState = resolveScheduleState(savedSchedule);
  const hasInput = value.amount !== "" || value.at !== "";
  const missingHalf = hasInput && (value.amount === "" || value.at === "");

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${idPrefix}-scheduled-amount`}
          type="number"
          min={min}
          max={max}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder="予約額"
          aria-label="予約額"
          className="h-9 max-w-[100px]"
          disabled={disabled}
        />
        <Input
          id={`${idPrefix}-scheduled-at`}
          type="datetime-local"
          value={value.at}
          onChange={(e) => onChange({ ...value, at: e.target.value })}
          aria-label="切替日時"
          className="h-9 max-w-[210px]"
          disabled={disabled}
        />
        {hasInput ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-slate-500"
            onClick={() => onChange({ amount: "", at: "" })}
            disabled={disabled}
          >
            予約を消す
          </Button>
        ) : null}
      </div>

      {missingHalf ? (
        <p className="text-xs font-medium text-red-600">
          予約は額と切替日時の両方が必要です
        </p>
      ) : null}

      {savedState.kind === "applied" ? (
        <p className="text-xs text-amber-700">
          {formatJst(savedState.at)} に {currentAmount} → {savedState.amount}{" "}
          へ切替済み。いま配られているのは <strong>{savedState.amount}</strong> です
        </p>
      ) : null}
    </div>
  );
}

/** 表示用の JST 文字列。サーバー/クライアントで同じ値になるよう手で組み立てる。 */
export function formatJst(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}/${pad(jst.getUTCMonth() + 1)}/${pad(jst.getUTCDate())} ` +
    `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
  );
}
