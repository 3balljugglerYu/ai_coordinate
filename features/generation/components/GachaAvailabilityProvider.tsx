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
 * ガチャプロンプトを見せてよいか(投稿の「ガチャ」の札など)を、クライアント側へ配る。
 *
 * 運営かどうかの判定(ADMIN_USER_IDS)はサーバー専用なので、User ORIGINAL の
 * `UserStylesAvailabilityProvider` と同じ2段階にする。初期値は公開フラグ
 * (`NEXT_PUBLIC_GACHA_PROMPT_ENABLED`)、段階公開中は {@link GachaAvailabilityUpgrade} を
 * サーバーから遅れて描き、運営だけ false → true に昇格させる。ページ本体はこれを待たない。
 */

const GachaAvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED === "true";
}

export function GachaAvailabilityProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(isPubliclyEnabled);
  // 参照を固定する。毎レンダーで作り直すと、これを依存に持つ側の effect が毎回動く。
  const upgrade = useCallback(() => setAvailable(true), []);
  const value = useMemo(() => ({ available, upgrade }), [available, upgrade]);
  return (
    <GachaAvailabilityContext.Provider value={value}>{children}</GachaAvailabilityContext.Provider>
  );
}

/** サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。表示は持たない。 */
export function GachaAvailabilityUpgrade() {
  const context = useContext(GachaAvailabilityContext);
  const upgrade = context?.upgrade;
  useEffect(() => {
    upgrade?.();
  }, [upgrade]);
  return null;
}

/** ガチャを見せてよいか。Provider の外では公開フラグ(公開前は false = 閉じる側)。 */
export function useGachaAvailable(): boolean {
  const context = useContext(GachaAvailabilityContext);
  return context ? context.available : isPubliclyEnabled();
}
