"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { TwoStageVisibility } from "@/features/inspire/lib/creator-looks-two-stage";

interface Props {
  initialVisibility: TwoStageVisibility;
}

const OPTIONS: Array<{
  value: TwoStageVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "admin_only",
    label: "運営のみ（未公開）",
    description:
      "admin / プレビュー権限のユーザーにのみ「衣装＋背景」モードを表示します（既定）。",
  },
  {
    value: "public",
    label: "全員に公開",
    description:
      "Creator Looks を利用できるユーザー全員に「衣装＋背景」モードを表示します。",
  },
];

export function CreatorLooksTwoStageForm({ initialVisibility }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [visibility, setVisibility] =
    useState<TwoStageVisibility>(initialVisibility);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      const response = await fetch("/api/admin/creator-looks-two-stage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast({
          title: "更新に失敗しました",
          description: data?.error ?? "しばらくしてから再度お試しください",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "保存しました", description: "公開レベルを更新しました" });
      router.refresh();
    } catch (err) {
      console.error("[CreatorLooksTwoStageForm] error:", err);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-3" disabled={isPending}>
        <legend className="mb-2 text-sm font-medium text-slate-700">
          公開レベル
        </legend>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
              visibility === opt.value
                ? "border-primary bg-primary/5"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="visibility"
              value={opt.value}
              checked={visibility === opt.value}
              onChange={() => setVisibility(opt.value)}
              className="mt-1 h-4 w-4"
            />
            <span className="min-w-0 space-y-1">
              <span className="block text-sm font-medium text-slate-800">
                {opt.label}
              </span>
              <span className="block text-xs leading-5 text-slate-500">
                {opt.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <Button type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
