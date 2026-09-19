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
 * User ORIGINAL（`/user-styles`）を出してよいかを、クライアント側へ配る。
 *
 * ## なぜ context なのか
 *
 * トグル（`OriginalKindTabs`）は `(styles-catalog)/layout.tsx` にある。
 * レイアウトで `isUserStylesAvailable`（閲覧者が要る）を呼ぶと、
 * **`/styles` が丸ごとリクエスト依存になり静的シェルが崩れる**
 * ── あのページは JSON-LD を初期 HTML に載せる前提で作られている。
 * かといって `ADMIN_USER_IDS` は `NEXT_PUBLIC_` を持たない**サーバー専用の値**なので、
 * クライアントでは判定そのものができない。
 *
 * ## 初期値と昇格の 2 段階
 *
 * 初期値は公開フラグ（`NEXT_PUBLIC_USER_STYLES_ENABLED`）。ビルド時に埋め込まれるので
 * 認証を待たずに決まり、一般公開後はここで確定してちらつかない。
 *
 * 段階公開中（フラグ OFF）は運営だけ true にしたいので、
 * {@link UserStylesAvailabilityUpgrade} をサーバー側から遅れて描き、
 * false → true に**昇格だけ**させる。ページ本体はこれを待たない。
 *
 * 🔥人気タブの `PopularPromptsAvailabilityProvider` と同じ構造にしてある。
 */

const UserStylesAvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USER_STYLES_ENABLED === "true";
}

export function UserStylesAvailabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [available, setAvailable] = useState(isPubliclyEnabled);

  // 参照を固定する。毎レンダーで作り直すと、これを依存に持つ側の effect が毎回動く。
  const upgrade = useCallback(() => setAvailable(true), []);
  const value = useMemo(() => ({ available, upgrade }), [available, upgrade]);

  return (
    <UserStylesAvailabilityContext.Provider value={value}>
      {children}
    </UserStylesAvailabilityContext.Provider>
  );
}

/**
 * サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。表示は持たない。
 */
export function UserStylesAvailabilityUpgrade() {
  const context = useContext(UserStylesAvailabilityContext);
  const upgrade = context?.upgrade;

  useEffect(() => {
    upgrade?.();
  }, [upgrade]);

  return null;
}

/**
 * User ORIGINAL を出してよいか。Provider の外では false（閉じる側に倒す）。
 */
export function useUserStylesAvailable(): boolean {
  return useContext(UserStylesAvailabilityContext)?.available ?? false;
}
