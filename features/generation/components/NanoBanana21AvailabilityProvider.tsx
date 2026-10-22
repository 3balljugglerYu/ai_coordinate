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
 * Nano Banana 2.1(`gemini-nano-banana-2.1-*`)を選んでよいかを、
 * クライアント側の広い範囲に配る。
 *
 * 2.1 は本番で運営だけが先に使い、合格ライン(同一性・品質の差・実原価・
 * 生成時間・事故なし)を確かめてから全公開する
 * (docs/planning/nano-banana-2-1-implementation-plan.md Phase 6・7)。
 * それまでは運営だけがモデル一覧に 2.1 の行を見る。
 *
 * `GptImage25AvailabilityProvider` と全く同じ構造(初期値は公開フラグ、
 * 段階公開中は運営だけサーバー側の判定で false → true に昇格する)。
 *
 * ⚠️ ここは「見せる/見せない」の層でしかない。実行の可否はサーバーの
 * `isNanoBanana21Available(user.id)` が生成の 3 つのハンドラで別途判定する。
 */

const NanoBanana21AvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED === "true";
}

export function NanoBanana21AvailabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [available, setAvailable] = useState(isPubliclyEnabled);

  // 参照を固定する。毎レンダーで作り直すと、これを依存に持つ側の effect が
  // 毎回動く事故を避ける(PopularPromptsAvailabilityProvider と同じ理由)。
  const upgrade = useCallback(() => setAvailable(true), []);
  const value = useMemo(() => ({ available, upgrade }), [available, upgrade]);

  return (
    <NanoBanana21AvailabilityContext.Provider value={value}>
      {children}
    </NanoBanana21AvailabilityContext.Provider>
  );
}

/**
 * サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。
 * 表示は持たない。
 */
export function NanoBanana21AvailabilityUpgrade() {
  const context = useContext(NanoBanana21AvailabilityContext);
  const upgrade = context?.upgrade;

  useEffect(() => {
    upgrade?.();
  }, [upgrade]);

  return null;
}

/**
 * Nano Banana 2.1 を選んでよいか。
 * Provider の外では false(閉じる側に倒す)。
 */
export function useNanoBanana21Available(): boolean {
  return useContext(NanoBanana21AvailabilityContext)?.available ?? false;
}
