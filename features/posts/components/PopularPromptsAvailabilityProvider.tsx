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
 * 🔥人気タブを出してよいかを、クライアント側の広い範囲に配る。
 *
 * ## なぜ context なのか
 *
 * タブを描く `SortTabs` は `PostList` の中にあり、`PostList` はホーム・検索・
 * プロフィールなど複数のページから使われる。可否を props で配ろうとすると
 * 全経路に引き回すことになるうえ、`ADMIN_USER_IDS` は `NEXT_PUBLIC_` を持たない
 * **サーバー専用の値**なので、クライアントでは判定そのものができない。
 *
 * ## 初期値と昇格の 2 段階
 *
 * 初期値は公開フラグ（`NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED`）。ビルド時に
 * 埋め込まれるので認証を待たずに決まり、一般公開後はここで確定してちらつかない。
 *
 * 段階公開中（フラグ OFF）は運営だけ true にしたいので、
 * {@link PopularPromptsAvailabilityUpgrade} をサーバー側から遅れて描き、
 * false → true に**昇格だけ**させる。ページ本体はこれを待たない。
 *
 * 検索の `SearchAvailabilityProvider` と同じ構造にしてある。
 */

const PopularPromptsAvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED === "true";
}

export function PopularPromptsAvailabilityProvider({
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
    <PopularPromptsAvailabilityContext.Provider value={value}>
      {children}
    </PopularPromptsAvailabilityContext.Provider>
  );
}

/**
 * サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。
 * 表示は持たない。
 */
export function PopularPromptsAvailabilityUpgrade() {
  const context = useContext(PopularPromptsAvailabilityContext);
  const upgrade = context?.upgrade;

  useEffect(() => {
    upgrade?.();
  }, [upgrade]);

  return null;
}

/**
 * 🔥人気タブを出してよいか。Provider の外では false（閉じる側に倒す）。
 */
export function usePopularPromptsAvailable(): boolean {
  return useContext(PopularPromptsAvailabilityContext)?.available ?? false;
}
