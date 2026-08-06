"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

interface BonusDefault {
  source: string;
  amount: number;
  label: string;
}

interface StreakDefault {
  streak_day: number;
  amount: number;
}

interface PercoinDefaultsFormProps {
  bonusDefaults: BonusDefault[];
  streakDefaults: StreakDefault[];
}

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 1000;

/**
 * クリエイター還元(利用されるたびに付与)は 0〜5。
 * 0 = 付与しない。上限5は1生成の最低コスト(10)より十分小さい安全域で、
 * 2アカウントの相互利用でも残高が純増しないようにするための制限。
 * API・DB CHECK にも同じ範囲がある。
 */
const USAGE_REWARD_SOURCES = new Set<string>([
  "prompt_usage_reward",
  "style_usage_reward",
]);
const USAGE_REWARD_MIN = 0;
const USAGE_REWARD_MAX = 5;

function amountRangeFor(source: string): { min: number; max: number } {
  return USAGE_REWARD_SOURCES.has(source)
    ? { min: USAGE_REWARD_MIN, max: USAGE_REWARD_MAX }
    : { min: AMOUNT_MIN, max: AMOUNT_MAX };
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

  // 還元は「利用のたびに付与」で他の特典と性質が違うため、別セクションに分けて
  // 注意書きと一緒に表示する(マイグレーション未適用の環境では行が無く非表示)。
  const usageRewardDefaults = bonusDefaults.filter(({ source }) =>
    USAGE_REWARD_SOURCES.has(source)
  );

  const handleBonusChange = (source: string, value: string) => {
    const num = parseInt(value, 10);
    const { min, max } = amountRangeFor(source);
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

  const validate = (): boolean => {
    for (const [, amount] of Object.entries(bonusValues)) {
      if (amount < AMOUNT_MIN || amount > AMOUNT_MAX) return false;
    }
    for (let d = 1; d <= 14; d++) {
      const amount = streakValues[d] ?? 0;
      if (amount < AMOUNT_MIN || amount > AMOUNT_MAX) return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast({
        title: "入力エラー",
        description: `枚数は${AMOUNT_MIN}〜${AMOUNT_MAX}の範囲で入力してください`,
        variant: "destructive",
      });
      return;
    }

    setIsPending(true);
    try {
      const bonusPayload = Object.entries(bonusValues).map(([source, amount]) => ({
        source,
        amount,
      }));

      const streakPayload = Array.from({ length: 14 }, (_, i) => i + 1).map(
        (day) => ({
          streak_day: day,
          amount: streakValues[day]!,
        })
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
        description: "デフォルト枚数を更新しました",
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
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 単一枚数タイプ */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          特典別デフォルト枚数
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {bonusDefaults
            .filter(({ source }) => !USAGE_REWARD_SOURCES.has(source))
            .map(({ source, label }) => (
              <div key={source} className="space-y-2">
                <Label htmlFor={`bonus-${source}`}>{label}</Label>
                <Input
                  id={`bonus-${source}`}
                  type="number"
                  min={AMOUNT_MIN}
                  max={AMOUNT_MAX}
                  value={bonusValues[source] ?? ""}
                  onChange={(e) => handleBonusChange(source, e.target.value)}
                  className="max-w-[120px]"
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
          <div className="grid gap-4 sm:grid-cols-2">
            {usageRewardDefaults.map(({ source, label }) => (
              <div key={source} className="space-y-2">
                <Label htmlFor={`bonus-${source}`}>{label}</Label>
                <Input
                  id={`bonus-${source}`}
                  type="number"
                  min={USAGE_REWARD_MIN}
                  max={USAGE_REWARD_MAX}
                  value={bonusValues[source] ?? ""}
                  onChange={(e) => handleBonusChange(source, e.target.value)}
                  className="max-w-[120px]"
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
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((day) => (
                <tr key={day} className="border-b border-slate-100">
                  <td className="py-2 px-3">{day}日目</td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      min={AMOUNT_MIN}
                      max={AMOUNT_MAX}
                      value={streakValues[day] ?? ""}
                      onChange={(e) => handleStreakChange(day, e.target.value)}
                      className="max-w-[100px] h-9"
                      disabled={isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : "保存"}
        </Button>
      </div>
    </form>
  );
}
