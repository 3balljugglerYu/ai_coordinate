"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// デスクトップ判定（mdブレークポイント: 768px）
const DESKTOP_BREAKPOINT = 768;

function isDesktop(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT;
}

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isSearchPage = pathname === "/search";

  // URLパラメータから初期値を取得
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearchQuery(q);
    }
  }, [searchParams]);

  // 検索クエリを含むURLパラメータを構築
  const buildSearchParams = useCallback((query: string): URLSearchParams => {
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }
    return params;
  }, [searchParams]);

  // 検索実行処理
  const handleSearch = useCallback(() => {
    const params = buildSearchParams(searchQuery);
    
    // PC版の場合は検索画面に遷移
    if (isDesktop() && !isSearchPage) {
      const newUrl = params.toString() 
        ? `/search?${params.toString()}`
        : "/search";
      router.push(newUrl);
    } else {
      // モバイル版、または既に検索画面にいる場合は現在の画面で検索結果を更新
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchQuery, router, searchParams, isSearchPage, buildSearchParams]);

  // Enterキーで検索実行（IME確定時はスキップ）
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  const handleClear = useCallback(() => {
    setSearchQuery("");
    // クリア時も検索を実行（URLパラメータを削除）
    const params = buildSearchParams("");
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [router, buildSearchParams]);

  // フォーカス時の検索画面遷移（入力値保持、モバイル版のみ）
  const handleFocus = useCallback(() => {
    if (!isSearchPage && !isDesktop()) {
      // モバイル版のみ検索画面に遷移
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      const newUrl = params.toString() 
        ? `/search?${params.toString()}`
        : "/search";
      router.push(newUrl);
    }
  }, [router, searchQuery, isSearchPage]);

  // 検索画面での自動フォーカス
  useEffect(() => {
    if (isSearchPage && inputRef.current) {
      // 少し遅延させてフォーカス（レンダリング完了後）
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSearchPage]);

  return (
    <div className="relative flex-1 max-w-md min-w-[120px]">
      <div className="relative flex items-center gap-1.5">
        {/* 戻るアイコン（検索画面でのみ表示、モバイル版のみ） */}
        {isSearchPage && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="shrink-0 h-7 w-7 md:hidden"
            aria-label="戻る"
          >
            <ArrowLeft className="h-3 w-3" />
          </Button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="プロンプト検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            className={cn(
              "h-7 pl-7 pr-7 text-xs py-1",
              searchQuery && "pr-7"
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="検索をクリア"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* 検索ボタン（PC版では常に表示、モバイル版では検索画面でのみ表示） */}
        <Button
          type="button"
          onClick={handleSearch}
          size="sm"
          variant="secondary"
          className={cn(
            "shrink-0 h-7 px-2 text-sm py-1 bg-gray-100 hover:bg-gray-200",
            !isSearchPage && "hidden md:flex"
          )}
          aria-label="検索"
        >
          <Search className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
