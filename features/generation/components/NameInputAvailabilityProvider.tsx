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
 * 名前の欄を見せてよいか(投稿の「名前入り」の札など)を、クライアント側へ配る。
 *
 * 運営かどうかの判定(ADMIN_USER_IDS)はサーバー専用なので、User ORIGINAL の
 * `UserStylesAvailabilityProvider` と同じ2段階にする。初期値は公開フラグ
 * (`NEXT_PUBLIC_NAME_INPUT_ENABLED`)、段階公開中は {@link NameInputAvailabilityUpgrade} を
 * サーバーから遅れて描き、運営だけ false → true に昇格させる。ページ本体はこれを待たない。
 */

const NameInputAvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NAME_INPUT_ENABLED === "true";
}

export function NameInputAvailabilityProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(isPubliclyEnabled);
  // 参照を固定する。毎レンダーで作り直すと、これを依存に持つ側の effect が毎回動く。
  const upgrade = useCallback(() => setAvailable(true), []);
  const value = useMemo(() => ({ available, upgrade }), [available, upgrade]);
  return (
    <NameInputAvailabilityContext.Provider value={value}>{children}</NameInputAvailabilityContext.Provider>
  );
}

/** サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。表示は持たない。 */
export function NameInputAvailabilityUpgrade() {
  const context = useContext(NameInputAvailabilityContext);
  const upgrade = context?.upgrade;
  useEffect(() => {
    upgrade?.();
  }, [upgrade]);
  return null;
}

/** 名前の欄を見せてよいか。Provider の外では公開フラグ(公開前は false = 閉じる側)。 */
export function useNameInputAvailable(): boolean {
  const context = useContext(NameInputAvailabilityContext);
  return context ? context.available : isPubliclyEnabled();
}
