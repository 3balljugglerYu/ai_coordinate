"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  CLASSIC_BONUS_MAX_AMOUNT,
  CLASSIC_BONUS_MIN_AMOUNT,
  USAGE_REWARD_MAX_AMOUNT,
  USAGE_REWARD_MIN_AMOUNT,
  getBonusAmountRange,
  isUsageRewardBonusSource,
} from "@/features/credits/lib/percoin-bonus-defaults";
import {
  resolveEffectiveAmount,
  summarizeScheduleChanges,
  validateScheduledAt,
  type ScheduleChange,
} from "@/features/credits/lib/percoin-schedule";
import { parseDatetimeLocalJst } from "@/lib/datetime/format-datetime-local-jst";
import { ScheduleFields, formatJst, type ScheduleInput } from "./ScheduleFields";

interface BonusDefault {
  source: string;
  amount: number;
  label: string;
  scheduledAmount: number | null;
  scheduledAtLocal: string;
  scheduledAt: string | null;
  /** 既に切り替わった予約（サーバーで判定済み）。amount には切替後の額が入っている */
  appliedFrom: string | null;
  previousAmount: number | null;
}

interface StreakDefault {
  streak_day: number;
  amount: number;
  scheduledAmount: number | null;
  scheduledAtLocal: string;
  scheduledAt: string | null;
  appliedFrom: string | null;
  previousAmount: number | null;
}

interface PercoinDefaultsFormProps {
  bonusDefaults: BonusDefault[];
  streakDefaults: StreakDefault[];
}

const AMOUNT_MIN = CLASSIC_BONUS_MIN_AMOUNT;
const AMOUNT_MAX = CLASSIC_BONUS_MAX_AMOUNT;
const USAGE_REWARD_MIN = USAGE_REWARD_MIN_AMOUNT;
const USAGE_REWARD_MAX = USAGE_REWARD_MAX_AMOUNT;

const EMPTY_SCHEDULE: ScheduleInput = { amount: "", at: "" };

function toScheduleInput(row: {
  scheduledAmount: number | null;
  scheduledAtLocal: string;
}): ScheduleInput {
  return {
    amount: row.scheduledAmount === null ? "" : String(row.scheduledAmount),
    at: row.scheduledAtLocal,
  };
}

export function PercoinDefaultsForm({
  bonusDefaults,
  streakDefaults,
}: PercoinDefaultsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const [bonusValues, setBonusValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(bonusDefaults.map((b) => [b.source, b.amount]))
  );

  const [streakValues, setStreakValues] = useState<Record<number, number>>(() =>
    Object.fromEntries(streakDefaults.map((s) => [s.streak_day, s.amount]))
  );

  const [bonusSchedules, setBonusSchedules] = useState<
    Record<string, ScheduleInput>
  >(() =>
    Object.fromEntries(bonusDefaults.map((b) => [b.source, toScheduleInput(b)]))
  );

  const [streakSchedules, setStreakSchedules] = useState<
    Record<number, ScheduleInput>
  >(() =>
    Object.fromEntries(
      streakDefaults.map((s) => [s.streak_day, toScheduleInput(s)])
    )
  );

  /** 一括で入れる切替日時（datetime-local の値）。 */
  const [bulkAt, setBulkAt] = useState("");

  /** 保存前の確認に出す内容。null なら確認中でない。 */
  const [pendingConfirm, setPendingConfirm] = useState<
    Array<{ at: string; items: ScheduleChange[] }> | null
  >(null);

  // 還元は「利用のたびに付与」で他の特典と性質が違うため、別セクションに分けて
  // 注意書きと一緒に表示する(マイグレーション未適用の環境では行が無く非表示)。
  const usageRewardDefaults = bonusDefaults.filter(({ source }) =>
    isUsageRewardBonusSource(source)
  );

  const handleBonusChange = (source: string, value: string) => {
    const num = parseInt(value, 10);
    const { min, max } = getBonusAmountRange(source);
    setBonusValues((prev) => ({
      ...prev,
      [source]: Number.isNaN(num) ? min : Math.min(max, Math.max(min, num)),
    }));
  };

  const handleStreakChange = (day: number, value: string) => {
    const num = parseInt(value, 10);
    setStreakValues((prev) => ({
      ...prev,
      [day]: Number.isNaN(num) ? 0 : Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, num)),
    }));
  };

  /**
   * 一括適用。**予約額を入れた項目にだけ**日時を入れる。
   * 全項目に日時を入れてしまうと、額の無い予約が大量にできて保存できなくなる。
   */
  const applyBulkDate = () => {
    if (!bulkAt) return;

    let applied = 0;
    setBonusSchedules((prev) => {
      const next = { ...prev };
      for (const [source, schedule] of Object.entries(prev)) {
        if (schedule.amount !== "") {
          next[source] = { ...schedule, at: bulkAt };
          applied += 1;
        }
      }
      return next;
    });
    setStreakSchedules((prev) => {
      const next = { ...prev };
      for (const [day, schedule] of Object.entries(prev)) {
        if (schedule.amount !== "") {
          next[Number(day)] = { ...schedule, at: bulkAt };
          applied += 1;
        }
      }
      return next;
    });

    toast({
      title: applied > 0 ? "切替日時を入れました" : "予約額が未入力です",
      description:
        applied > 0
          ? "予約額を入れた項目に同じ日時を設定しました"
          : "先に予約額を入れてから、日時をまとめて設定してください",
      variant: applied > 0 ? undefined : "destructive",
    });
  };

  /** 入力中の予約を、保存できる形（ISO）へ。エラーがあれば文言を返す。 */
  const collectSchedules = ():
    | { ok: true; changes: ScheduleChange[] }
    | { ok: false; error: string } => {
    const changes: ScheduleChange[] = [];

    for (const { source, label } of bonusDefaults) {
      const schedule = bonusSchedules[source] ?? EMPTY_SCHEDULE;
      if (schedule.amount === "" && schedule.at === "") continue;
      if (schedule.amount === "" || schedule.at === "") {
        return { ok: false, error: `${label} の予約は額と切替日時の両方が必要です` };
      }

      const amount = Number(schedule.amount);
      const { min, max } = getBonusAmountRange(source);
      if (!Number.isInteger(amount) || amount < min || amount > max) {
        return {
          ok: false,
          error: `${label} の予約額は ${min}〜${max} で入力してください`,
        };
      }

      const iso = parseDatetimeLocalJst(schedule.at);
      if (!iso) {
        return { ok: false, error: `${label} の切替日時が正しくありません` };
      }
      const atError = validateScheduledAt(iso);
      if (atError) {
        return { ok: false, error: `${label}: ${atError}` };
      }

      changes.push({
        label,
        currentAmount: bonusValues[source] ?? 0,
        nextAmount: amount,
        at: iso,
      });
    }

    for (const { streak_day: day } of streakDefaults) {
      const schedule = streakSchedules[day] ?? EMPTY_SCHEDULE;
      if (schedule.amount === "" && schedule.at === "") continue;
      const label = `連続ログイン ${day}日目`;
      if (schedule.amount === "" || schedule.at === "") {
        return { ok: false, error: `${label} の予約は額と切替日時の両方が必要です` };
      }

      const amount = Number(schedule.amount);
      if (!Number.isInteger(amount) || amount < AMOUNT_MIN || amount > AMOUNT_MAX) {
        return {
          ok: false,
          error: `${label} の予約額は ${AMOUNT_MIN}〜${AMOUNT_MAX} で入力してください`,
        };
      }

      const iso = parseDatetimeLocalJst(schedule.at);
      if (!iso) {
        return { ok: false, error: `${label} の切替日時が正しくありません` };
      }
      const atError = validateScheduledAt(iso);
      if (atError) {
        return { ok: false, error: `${label}: ${atError}` };
      }

      changes.push({
        label,
        currentAmount: streakValues[day] ?? 0,
        nextAmount: amount,
        at: iso,
      });
    }

    return { ok: true, changes };
  };

  // 範囲は source ごとに違う(還元は 0 が「付与しない」を意味する有効値)。
  // 一律に 1〜1000 で判定すると還元の 0 が保存できなくなる。
  const validate = (): boolean => {
    for (const [source, amount] of Object.entries(bonusValues)) {
      const { min, max } = getBonusAmountRange(source);
      if (amount < min || amount > max) return false;
    }
    for (let d = 1; d <= 14; d++) {
      const amount = streakValues[d] ?? 0;
      if (amount < AMOUNT_MIN || amount > AMOUNT_MAX) return false;
    }
    return true;
  };

  const save = async (changes: ScheduleChange[]) => {
    setIsPending(true);
    try {
      const bonusPayload = bonusDefaults.map(({ source }) => {
        const schedule = bonusSchedules[source] ?? EMPTY_SCHEDULE;
        const iso =
          schedule.amount !== "" && schedule.at !== ""
            ? parseDatetimeLocalJst(schedule.at)
            : null;
        return {
          source,
          amount: bonusValues[source]!,
          scheduled_amount: iso === null ? null : Number(schedule.amount),
          scheduled_at: iso,
        };
      });

      const streakPayload = Array.from({ length: 14 }, (_, i) => i + 1).map(
        (day) => {
          const schedule = streakSchedules[day] ?? EMPTY_SCHEDULE;
          const iso =
            schedule.amount !== "" && schedule.at !== ""
              ? parseDatetimeLocalJst(schedule.at)
              : null;
          return {
            streak_day: day,
            amount: streakValues[day]!,
            scheduled_amount: iso === null ? null : Number(schedule.amount),
            scheduled_at: iso,
          };
        }
      );

      const response = await fetch("/api/admin/percoin-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bonusDefaults: bonusPayload,
          streakDefaults: streakPayload,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "更新に失敗しました",
          description: data.error ?? "しばらくしてから再度お試しください",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "保存しました",
        description:
          changes.length > 0
            ? `予約 ${changes.length} 件を含めて更新しました`
            : "デフォルト枚数を更新しました",
      });

      router.refresh();
    } catch (err) {
      console.error("[PercoinDefaultsForm] Error:", err);
      toast({
        title: "更新に失敗しました",
        description: "ネットワークエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
      setPendingConfirm(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast({
        title: "入力エラー",
        description: `枚数は${AMOUNT_MIN}〜${AMOUNT_MAX}（クリエイター還元は${USAGE_REWARD_MIN}〜${USAGE_REWARD_MAX}）の範囲で入力してください`,
        variant: "destructive",
      });
      return;
    }

    const collected = collectSchedules();
    if (!collected.ok) {
      toast({
        title: "予約の入力エラー",
        description: collected.error,
        variant: "destructive",
      });
      return;
    }

    /*
      予約がある保存は、押した瞬間ではなく将来効く。何がいつ変わるのかを
      一度見せてから確定させる（一括適用の取り違えはここで気づける）。
    */
    if (collected.changes.length > 0) {
      setPendingConfirm(summarizeScheduleChanges(collected.changes));
      return;
    }

    await save([]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 予約の一括設定 */}
      <section className="rounded-lg border border-violet-200 bg-violet-50/60 p-4">
        <h2 className="text-sm font-semibold text-violet-900">
          予約（指定した日時に自動で切り替わります）
        </h2>
        <p className="mt-1 text-xs text-violet-900/80">
          各項目に「予約額」と「切替日時」を入れて保存すると、その時刻から新しい額に
          なります。現在の額は書き換わりません。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Label htmlFor="bulk-at" className="text-xs text-violet-900">
            まとめて日時を入れる
          </Label>
          <Input
            id="bulk-at"
            type="datetime-local"
            value={bulkAt}
            onChange={(e) => setBulkAt(e.target.value)}
            className="h-9 max-w-[210px] bg-white"
            disabled={isPending}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9"
            onClick={applyBulkDate}
            disabled={isPending || !bulkAt}
          >
            予約額を入れた項目に適用
          </Button>
        </div>
        <p className="mt-2 text-xs text-violet-900/70">
          先に各項目の「予約額」を入れてから押してください。額が空の項目には入りません。
        </p>
      </section>

      {/* 単一枚数タイプ */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          特典別デフォルト枚数
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {bonusDefaults
            .filter(({ source }) => !isUsageRewardBonusSource(source))
            .map((row) => (
              <div key={row.source} className="space-y-2">
                <Label htmlFor={`bonus-${row.source}`}>{row.label}</Label>
                <Input
                  id={`bonus-${row.source}`}
                  type="number"
                  // 投稿ボーナス(生成方法ごと)は 0 が「付与しない」を意味する
                  // 有効値。一律 1〜1000 にすると 0 停止を保存できない
                  min={getBonusAmountRange(row.source).min}
                  max={getBonusAmountRange(row.source).max}
                  value={bonusValues[row.source] ?? ""}
                  onChange={(e) => handleBonusChange(row.source, e.target.value)}
                  className="max-w-[120px]"
                  disabled={isPending}
                />
                <ScheduleFields
                  idPrefix={`bonus-${row.source}`}
                  applied={
                    row.appliedFrom === null || row.previousAmount === null
                      ? null
                      : {
                          from: row.appliedFrom,
                          previousAmount: row.previousAmount,
                          amount: row.amount,
                        }
                  }
                  value={bonusSchedules[row.source] ?? EMPTY_SCHEDULE}
                  onChange={(next) =>
                    setBonusSchedules((prev) => ({ ...prev, [row.source]: next }))
                  }
                  min={getBonusAmountRange(row.source).min}
                  max={getBonusAmountRange(row.source).max}
                  disabled={isPending}
                />
              </div>
            ))}
        </div>
      </section>

      {/* クリエイター還元（利用されるたびに付与） */}
      {usageRewardDefaults.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            クリエイター還元（利用されるたびに付与）
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            他のユーザーが生成に利用するたび、プロンプトの作者・スタイルのクリエイターへ付与します。
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {usageRewardDefaults.map((row) => (
              <div key={row.source} className="space-y-2">
                <Label htmlFor={`bonus-${row.source}`}>{row.label}</Label>
                <Input
                  id={`bonus-${row.source}`}
                  type="number"
                  min={USAGE_REWARD_MIN}
                  max={USAGE_REWARD_MAX}
                  value={bonusValues[row.source] ?? ""}
                  onChange={(e) => handleBonusChange(row.source, e.target.value)}
                  className="max-w-[120px]"
                  disabled={isPending}
                />
                <ScheduleFields
                  idPrefix={`bonus-${row.source}`}
                  applied={
                    row.appliedFrom === null || row.previousAmount === null
                      ? null
                      : {
                          from: row.appliedFrom,
                          previousAmount: row.previousAmount,
                          amount: row.amount,
                        }
                  }
                  value={bonusSchedules[row.source] ?? EMPTY_SCHEDULE}
                  onChange={(next) =>
                    setBonusSchedules((prev) => ({ ...prev, [row.source]: next }))
                  }
                  min={USAGE_REWARD_MIN}
                  max={USAGE_REWARD_MAX}
                  disabled={isPending}
                />
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <li>・0 にすると付与しません（既定値は 0 = 停止中）。</li>
            <li>
              ・設定できるのは 0〜{USAGE_REWARD_MAX} です。1回の生成に最低 10
              ペルコインかかるため、それより十分小さい値に制限しています。
            </li>
            <li>・自分自身の利用では付与されません。</li>
            <li>
              ・Free はアプリ内の「このプロンプトで作る」から生成された場合のみ対象です。
              プロンプトをコピーして貼り付けた生成は対象外です。
            </li>
            <li>
              ・公開中の利用のみが対象です（取り下げ・審査中・非公開カテゴリでの生成は含みません）。
            </li>
          </ul>
        </section>
      )}

      {/* ストリーク（日数別） */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          連続ログイン特典（日数別）
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-medium text-slate-600">
                  日目
                </th>
                <th className="text-left py-2 px-3 font-medium text-slate-600">
                  枚数
                </th>
                <th className="text-left py-2 px-3 font-medium text-slate-600">
                  予約（額 / 切替日時）
                </th>
              </tr>
            </thead>
            <tbody>
              {streakDefaults.map((row) => (
                <tr key={row.streak_day} className="border-b border-slate-100">
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.streak_day}日目
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      min={AMOUNT_MIN}
                      max={AMOUNT_MAX}
                      aria-label={`${row.streak_day}日目の枚数`}
                      value={streakValues[row.streak_day] ?? ""}
                      onChange={(e) =>
                        handleStreakChange(row.streak_day, e.target.value)
                      }
                      className="max-w-[100px] h-9"
                      disabled={isPending}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <ScheduleFields
                      idPrefix={`streak-${row.streak_day}`}
                      applied={
                        row.appliedFrom === null || row.previousAmount === null
                          ? null
                          : {
                              from: row.appliedFrom,
                              previousAmount: row.previousAmount,
                              amount: row.amount,
                            }
                      }
                      value={
                        streakSchedules[row.streak_day] ?? EMPTY_SCHEDULE
                      }
                      onChange={(next) =>
                        setStreakSchedules((prev) => ({
                          ...prev,
                          [row.streak_day]: next,
                        }))
                      }
                      min={AMOUNT_MIN}
                      max={AMOUNT_MAX}
                      disabled={isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 保存前の確認 */}
      {pendingConfirm ? (
        <section
          data-testid="schedule-confirm"
          className="rounded-lg border-2 border-violet-300 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            この内容で予約します
          </h2>
          <div className="mt-3 space-y-3">
            {pendingConfirm.map((group) => (
              <div key={group.at}>
                <p className="text-sm font-medium text-violet-900">
                  {formatJst(new Date(group.at))} から
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      ・{item.label}：{item.currentAmount} →{" "}
                      <strong>{item.nextAmount}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              onClick={() =>
                void save(pendingConfirm.flatMap((group) => group.items))
              }
              disabled={isPending}
            >
              {isPending ? "保存中..." : "この内容で保存"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingConfirm(null)}
              disabled={isPending}
            >
              戻って直す
            </Button>
          </div>
        </section>
      ) : (
        <div className="pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      )}
    </form>
  );
}

/** 予約の切替後に実際に配られる額（表示の確認用）。 */
export function effectiveAmountForDisplay(row: {
  amount: number;
  scheduledAmount: number | null;
  scheduledAt: string | null;
}): number {
  return resolveEffectiveAmount(row.amount, {
    scheduledAmount: row.scheduledAmount,
    scheduledAt: row.scheduledAt,
  });
}
