"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Loader2, User, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ListUser {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at?: string;
}

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "created_at_desc", label: "登録日時 新しい順" },
  { value: "created_at_asc", label: "登録日時 古い順" },
  { value: "nickname_asc", label: "ニックネーム あいうえお順" },
  { value: "nickname_desc", label: "ニックネーム 逆順" },
] as const;

function UserListItem({ u }: { u: ListUser }) {
  return (
    <Link
      href={`/admin/users/${u.user_id}`}
      className="flex items-center gap-4 rounded-lg border border-slate-200/80 bg-slate-50/50 p-4 transition-colors hover:bg-violet-50/50 hover:border-violet-200/60"
    >
      {u.avatar_url ? (
        <Image
          src={u.avatar_url}
          alt=""
          width={48}
          height={48}
          className="rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200">
          <User className="h-6 w-6 text-slate-500" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">
          {u.nickname || "（ニックネーム未設定）"}
        </p>
        <p className="truncate text-xs text-slate-500 font-mono">
          {u.user_id}
        </p>
      </div>
      <span className="shrink-0 text-sm text-violet-600">詳細 →</span>
    </Link>
  );
}

export function UserSearchClient() {
  const [query, setQuery] = useState("");
  const [searchUsers, setSearchUsers] = useState<ListUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [listUsers, setListUsers] = useState<ListUser[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listTotal, setListTotal] = useState(0);
  const [listOffset, setListOffset] = useState(0);
  const [listSort, setListSort] = useState("created_at_desc");
  const [listFilter, setListFilter] = useState("");

  const fetchList = useCallback(
    async (offset: number) => {
      setListLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        params.set("sort", listSort);
        if (listFilter.trim()) params.set("q", listFilter.trim());

        const res = await fetch(`/api/admin/users?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "取得に失敗しました");
        setListUsers(data.users || []);
        setListTotal(data.total ?? 0);
        setListOffset(offset);
      } catch (err) {
        console.error(err);
        setListUsers([]);
      } finally {
        setListLoading(false);
      }
    },
    [listSort, listFilter]
  );

  useEffect(() => {
    fetchList(0);
  }, [fetchList]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setSearchError("2文字以上で検索してください");
      return;
    }

    setSearchError(null);
    setSearchLoading(true);
    setSearched(true);

    try {
      const res = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "検索に失敗しました");
      }

      setSearchUsers(data.users || []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "検索に失敗しました");
      setSearchUsers([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const hasPrev = listOffset > 0;
  const hasNext = listOffset + PAGE_SIZE < listTotal;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            type="text"
            placeholder="ユーザーID（UUID）またはニックネーム"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            aria-label="検索クエリ"
          />
        </div>
        <Button type="submit" disabled={searchLoading}>
          {searchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            "検索"
          )}
        </Button>
      </form>

      {searchError && (
        <p className="text-sm text-red-600" role="alert">
          {searchError}
        </p>
      )}

      {searched && !searchLoading && (
        <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              検索結果
            </h2>
            {searchUsers.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">
                該当するユーザーが見つかりませんでした。
              </p>
            ) : (
              <ul className="space-y-3">
                {searchUsers.map((u) => (
                  <li key={u.user_id}>
                    <UserListItem u={u} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Users className="h-5 w-5 text-violet-600" />
              ユーザー一覧
              <span className="text-sm font-normal text-slate-500">
                （全{listTotal}件）
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="text"
                placeholder="ニックネーム・IDで絞り込み"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                className="w-48"
                aria-label="一覧フィルター"
              />
              <Select value={listSort} onValueChange={setListSort}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchList(0)}
                disabled={listLoading}
              >
                適用
              </Button>
            </div>
          </div>
          {listLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : listUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              ユーザーがいません
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {listUsers.map((u) => (
                  <li key={u.user_id}>
                    <UserListItem u={u} />
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchList(listOffset - PAGE_SIZE)}
                  disabled={!hasPrev || listLoading}
                  aria-label="前のページ"
                >
                  <ChevronLeft className="h-4 w-4" />
                  前へ
                </Button>
                <span className="text-sm text-slate-600">
                  {listOffset + 1} - {Math.min(listOffset + PAGE_SIZE, listTotal)} / {listTotal}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchList(listOffset + PAGE_SIZE)}
                  disabled={!hasNext || listLoading}
                  aria-label="次のページ"
                >
                  次へ
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
