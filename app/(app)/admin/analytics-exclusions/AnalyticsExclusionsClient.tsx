"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { AnalyticsExclusion } from "@/features/admin-dashboard/lib/analytics-exclusion-repository";
import {
  EXCLUSION_REASON_MAX_LENGTH,
  validateExclusionReason,
} from "@/features/admin-dashboard/lib/admin-list-validation";

interface SearchUser {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function AnalyticsExclusionsClient({
  initialExclusions,
}: {
  initialExclusions: AnalyticsExclusion[];
}) {
  const { toast } = useToast();
  const [exclusions, setExclusions] = useState<AnalyticsExclusion[]>(initialExclusions);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const excludedUserIds = new Set(exclusions.map((e) => e.userId));
  const reasonCheck = validateExclusionReason(reason);

  const reload = async () => {
    const res = await fetch("/api/admin/analytics-exclusions");
    if (res.ok) {
      setExclusions((await res.json()) as AnalyticsExclusion[]);
    }
  };

  const showError = (error: unknown, fallback: string) => {
    toast({
      title: "エラー",
      description: error instanceof Error ? error.message : fallback,
      variant: "destructive",
    });
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast({
        title: "検索",
        description: "2文字以上で検索してください",
        variant: "destructive",
      });
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
      const body = (await res.json().catch(() => null)) as
        | { users?: SearchUser[]; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error || "検索に失敗しました");
      }
      setResults(body?.users ?? []);
    } catch (error) {
      showError(error, "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (userId: string) => {
    if (!reasonCheck.ok) {
      toast({ title: "理由", description: reasonCheck.error, variant: "destructive" });
      return;
    }
    setBusyUserId(userId);
    try {
      const res = await fetch("/api/admin/analytics-exclusions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, reason: reasonCheck.value }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "追加に失敗しました");
      }
      toast({ title: "追加しました", description: "集計から除くようにしました" });
      await reload();
    } catch (error) {
      showError(error, "追加に失敗しました");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (exclusion: AnalyticsExclusion) => {
    const name = exclusion.nickname ?? exclusion.userId;
    if (!window.confirm(`「${name}」を集計に戻しますか?`)) return;
    setBusyUserId(exclusion.userId);
    try {
      const res = await fetch(`/api/admin/analytics-exclusions/${exclusion.userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "外せませんでした");
      }
      toast({ title: "外しました", description: "集計に戻しました" });
      await reload();
    } catch (error) {
      showError(error, "外せませんでした");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">アカウントを足す</h2>
        <div className="space-y-1">
          <label htmlFor="exclusion-reason" className="text-sm text-slate-700">
            理由(必須・{EXCLUSION_REASON_MAX_LENGTH}文字まで)
          </label>
          <Input
            id="exclusion-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 外部審査用のテストアカウント"
          />
        </div>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="ニックネーム または ユーザーID で検索"
          />
          <Button type="button" onClick={handleSearch} pending={searching}>
            {searching ? "検索中..." : "検索"}
          </Button>
        </div>

        {results.length > 0 ? (
          <ul className="divide-y rounded-lg border border-slate-200">
            {results.map((u) => (
              <li key={u.user_id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {u.nickname ?? "(名前未設定)"}
                  </p>
                  <p className="truncate text-xs text-slate-400">{u.user_id}</p>
                </div>
                {excludedUserIds.has(u.user_id) ? (
                  <Badge variant="secondary">除いています</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAdd(u.user_id)}
                    pending={busyUserId === u.user_id}
                    disabled={!reasonCheck.ok}
                  >
                    除く
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          集計から除いているアカウント({exclusions.length}人)
        </h2>
        {exclusions.length === 0 ? (
          <p className="text-sm text-slate-500">まだ入っていません。</p>
        ) : (
          <ul className="divide-y rounded-lg border border-slate-200">
            {exclusions.map((e) => (
              <li key={e.userId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {e.nickname ?? "(名前未設定)"}
                  </p>
                  <p className="truncate text-xs text-slate-500">{e.reason}</p>
                  <p className="truncate text-xs text-slate-400">
                    {formatDate(e.createdAt)}
                    {e.addedByNickname ? `・${e.addedByNickname} が追加` : ""}
                    ・{e.userId}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleRemove(e)}
                  pending={busyUserId === e.userId}
                >
                  外す
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
