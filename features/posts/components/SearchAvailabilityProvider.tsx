"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * 検索・ハッシュタグを使えるかどうかを、クライアント側の広い範囲に配る。
 *
 * ## なぜ context なのか
 *
 * この値が要る場所は 2 種類ある。ヘッダーの検索バー（`AppShell` 配下。ページから
 * props を渡す経路が無い）と、キャプション表示（`PostFeedCard` などの奥）。
 * どちらか一方だけなら props で足りるが、前者はページを経由しないため配れない。
 *
 * ## 初期値と昇格の 2 段階
 *
 * 初期値は公開フラグ（`NEXT_PUBLIC_SEARCH_ENABLED`）。ビルド時に埋め込まれるので
 * 認証を待たずに決まり、一般公開後はここで確定してちらつかない。
 *
 * 段階公開中（フラグ OFF）は運営だけ true にしたいが、admin かどうかの判定は
 * サーバー秘匿。そこで {@link SearchAvailabilityUpgrade} をサーバー側から
 * 遅れて描き、false → true に**昇格だけ**させる。ページ本体はこれを待たない。
 */

const SearchAvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SEARCH_ENABLED === "true";
}

export function SearchAvailabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [available, setAvailable] = useState(isPubliclyEnabled);

  // 参照を固定する。毎レンダーで作り直すと、これを依存に持つ側の effect が
  // 毎回動く（PostList の初回ロードがループした原因と同じ型の事故）。
  const upgrade = useCallback(() => setAvailable(true), []);
  const value = useMemo(() => ({ available, upgrade }), [available, upgrade]);

  return (
    <SearchAvailabilityContext.Provider value={value}>
      {children}
    </SearchAvailabilityContext.Provider>
  );
}

/**
 * サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。
 * 表示は持たない。
 */
export function SearchAvailabilityUpgrade() {
  const context = useContext(SearchAvailabilityContext);
  const upgrade = context?.upgrade;

  useEffect(() => {
    upgrade?.();
  }, [upgrade]);

  return null;
}

/**
 * 検索・ハッシュタグを出してよいか。Provider の外では false（閉じる側に倒す）。
 */
export function useSearchAvailable(): boolean {
  return useContext(SearchAvailabilityContext)?.available ?? false;
}
