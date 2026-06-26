"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import type { CreatorAllowlistMember } from "@/features/creators/lib/creator-allowlist-repository";

interface SearchUser {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
}

export function CreatorAllowlistClient({
  initialMembers,
}: {
  initialMembers: CreatorAllowlistMember[];
}) {
  const { toast } = useToast();
  const [members, setMembers] = useState<CreatorAllowlistMember[]>(initialMembers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const memberUserIds = new Set(members.map((m) => m.userId));

  const reload = async () => {
    const res = await fetch("/api/admin/creator-allowlist");
    if (res.ok) {
      setMembers((await res.json()) as CreatorAllowlistMember[]);
    }
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
      const res = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(q)}`
      );
      const body = (await res.json().catch(() => null)) as
        | { users?: SearchUser[]; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error || "検索に失敗しました");
      }
      setResults(body?.users ?? []);
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "検索に失敗しました",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (userId: string) => {
    setBusyUserId(userId);
    try {
      const res = await fetch("/api/admin/creator-allowlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error || "追加に失敗しました");
      }
      toast({ title: "追加しました", description: "招待クリエイターに追加しました" });
      await reload();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "追加に失敗しました",
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggle = async (userId: string, nextActive: boolean) => {
    setBusyUserId(userId);
    try {
      const res = await fetch(`/api/admin/creator-allowlist/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "更新に失敗しました");
      }
      await reload();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!window.confirm("この招待を削除しますか?(履歴は残りません)")) return;
    setBusyUserId(userId);
    try {
      const res = await fetch(`/api/admin/creator-allowlist/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "削除に失敗しました");
      }
      toast({ title: "削除しました" });
      await reload();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* 追加: ユーザー検索 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">クリエイターを追加</h2>
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
          <Button type="button" onClick={handleSearch} disabled={searching}>
            {searching ? "検索中..." : "検索"}
          </Button>
        </div>

        {results.length > 0 ? (
          <ul className="divide-y rounded-lg border border-slate-200">
            {results.map((u) => {
              const already = memberUserIds.has(u.user_id);
              return (
                <li
                  key={u.user_id}
                  className="flex items-center gap-3 p-3"
                >
                  <Avatar url={u.avatar_url} alt={u.nickname ?? ""} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {u.nickname ?? "(名前未設定)"}
                    </p>
                    <p className="truncate text-xs text-slate-400">{u.user_id}</p>
                  </div>
                  {already ? (
                    <Badge variant="secondary">登録済み</Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAdd(u.user_id)}
                      disabled={busyUserId === u.user_id}
                    >
                      招待
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* 一覧 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          招待クリエイター({members.length}人)
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-slate-500">まだ登録がありません。</p>
        ) : (
          <ul className="divide-y rounded-lg border border-slate-200">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 p-3">
                <Avatar url={m.avatarUrl} alt={m.nickname ?? ""} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {m.nickname ?? "(名前未設定)"}
                    </p>
                    <Badge variant={m.isActive ? "default" : "secondary"}>
                      {m.isActive ? "有効" : "無効"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-slate-400">{m.userId}</p>
                  {m.note ? (
                    <p className="truncate text-xs text-slate-500">{m.note}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(m.userId, !m.isActive)}
                    disabled={busyUserId === m.userId}
                  >
                    {m.isActive ? "無効化" : "有効化"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemove(m.userId)}
                    disabled={busyUserId === m.userId}
                  >
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Avatar({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return <span className="h-9 w-9 shrink-0 rounded-full bg-slate-200" />;
  }
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-200">
      <Image src={url} alt={alt} fill sizes="36px" className="object-cover" />
    </span>
  );
}
