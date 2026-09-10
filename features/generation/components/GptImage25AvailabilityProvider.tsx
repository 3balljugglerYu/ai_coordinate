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
 * ChatGPT Images 2.5(`gpt-image-2.5-flare`)を選んでよいかを、
 * クライアント側の広い範囲に配る。
 *
 * ## なぜ段階公開にするか
 *
 * 2.5 は 2.0 と同額のまま「同一性が 2.0 以上・生成時間が短い・実原価が同等以下・
 * エラーや保存の事故なし」の4項目を本番で確かめてから全公開する
 * (docs/planning/gpt-image-2-5-flare-implementation-plan.md ADR-003)。
 * それまでは運営だけがモデル一覧に 2.5 の行を見る。
 *
 * ## なぜ context なのか
 *
 * この可否が要る場所はモデルセレクター(`LockableModelSelect`)と、
 * localStorage に残った選択を実効値へ丸める `resolveEffectiveModelForAuthState`
 * の呼び出し側(`GenerationForm` / `StylePageClient`)で、共通の親を props で辿れない。
 * `ADMIN_USER_IDS` は `NEXT_PUBLIC_` を持たないサーバー専用の値なので、
 * クライアント単独では判定できない。
 *
 * ## 初期値と昇格の2段階
 *
 * 🔥人気タブ(`PopularPromptsAvailabilityProvider`)・進捗バー
 * (`GenerationProgressAvailabilityProvider`)と全く同じ構造。
 * 初期値は公開フラグ、段階公開中は運営だけサーバー側の判定で
 * false → true に昇格する。
 *
 * ⚠️ ここは「見せる/見せない」の層でしかない。実行の可否はサーバーの
 * `isGptImage25Available(user.id)` が両 `generate-async` ハンドラで別途判定する。
 */

const GptImage25AvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED === "true";
}

export function GptImage25AvailabilityProvider({
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
    <GptImage25AvailabilityContext.Provider value={value}>
      {children}
    </GptImage25AvailabilityContext.Provider>
  );
}

/**
 * サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。
 * 表示は持たない。
 */
export function GptImage25AvailabilityUpgrade() {
  const context = useContext(GptImage25AvailabilityContext);
  const upgrade = context?.upgrade;

  useEffect(() => {
    upgrade?.();
  }, [upgrade]);

  return null;
}

/**
 * ChatGPT Images 2.5 を選んでよいか。
 * Provider の外では false(閉じる側に倒す)。
 */
export function useGptImage25Available(): boolean {
  return useContext(GptImage25AvailabilityContext)?.available ?? false;
}
