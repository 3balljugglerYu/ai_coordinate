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
 * バックグラウンド生成進捗バー（PR #594）を出してよいかを、
 * クライアント側の広い範囲に配る。
 *
 * ## なぜ段階公開にするか
 *
 * 実機での完全なE2E検証（実際に課金してのAI生成→シートを閉じる→
 * 完了トースト→遷移→戻るボタン）は、ローカルdevサーバーの制約
 * （`nextUrl.host` が常に `localhost` 固定になり、`ensureSameOrigin` の
 * チェックで LAN 実機からの mutation が弾かれる）で行えなかった。
 * 本番でまず運営だけが確認できる状態にしてから全公開する。
 *
 * ## なぜ context なのか
 *
 * この可否が要る場所は `GenerationProgressHost`（`LocaleShell` 直下）と
 * `PromptLockedGenerationSheet`（ホーム・投稿詳細など複数のページから
 * 開かれる）の2箇所で、共通の親を props で辿れない。
 * `ADMIN_USER_IDS` は `NEXT_PUBLIC_` を持たないサーバー専用の値なので、
 * クライアント単独では判定できない。
 *
 * ## 初期値と昇格の2段階
 *
 * 🔥人気タブ（`PopularPromptsAvailabilityProvider`）と全く同じ構造。
 * 初期値は公開フラグ、段階公開中は運営だけサーバー側の判定で
 * false → true に昇格する。
 */

const GenerationProgressAvailabilityContext = createContext<{
  available: boolean;
  upgrade: () => void;
} | null>(null);

/** ビルド時に埋め込まれる公開フラグ。認証を伴わないので同期的に読める。 */
function isPubliclyEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED === "true"
  );
}

export function GenerationProgressAvailabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [available, setAvailable] = useState(isPubliclyEnabled);

  // 参照を固定する。毎レンダーで作り直すと、これを依存に持つ側の effect が
  // 毎回動く事故を避ける（PopularPromptsAvailabilityProvider と同じ理由）。
  const upgrade = useCallback(() => setAvailable(true), []);
  const value = useMemo(() => ({ available, upgrade }), [available, upgrade]);

  return (
    <GenerationProgressAvailabilityContext.Provider value={value}>
      {children}
    </GenerationProgressAvailabilityContext.Provider>
  );
}

/**
 * サーバーで運営と判定できたときだけ描かれ、値を true へ昇格させる。
 * 表示は持たない。
 */
export function GenerationProgressAvailabilityUpgrade() {
  const context = useContext(GenerationProgressAvailabilityContext);
  const upgrade = context?.upgrade;

  useEffect(() => {
    upgrade?.();
  }, [upgrade]);

  return null;
}

/**
 * バックグラウンド生成進捗バーを出してよいか。
 * Provider の外では false（閉じる側に倒す）。
 */
export function useGenerationProgressAvailable(): boolean {
  return useContext(GenerationProgressAvailabilityContext)?.available ?? false;
}
