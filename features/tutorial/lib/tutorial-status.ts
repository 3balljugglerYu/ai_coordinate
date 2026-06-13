import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * チュートリアルが「表示中 or これから表示される」状態かを判定する。
 * true の間はホーム画面で他のオーバーレイ(ポップアップバナー等)を抑制し、
 * チュートリアルの進行を妨げないために使う。
 *
 * 判定条件(いずれか):
 * - ツアー進行中(sessionStorage の in_progress)
 * - 開始モーダルが出る条件: ログイン済み かつ 未完了 かつ 未スキップ
 *
 * スキップ(declined)済みユーザーはチュートリアルが出ないため対象外
 * (= バナーを出してよい)。
 */
export function isTutorialActiveOrPending(opts: {
  isAuthenticated: boolean;
  tutorialCompleted: boolean;
}): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const inProgress =
      window.sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS) ===
      "true";
    if (inProgress) {
      return true;
    }

    const declined =
      window.localStorage.getItem(TUTORIAL_STORAGE_KEYS.DECLINED) === "true";

    return opts.isAuthenticated && !opts.tutorialCompleted && !declined;
  } catch {
    // プライベートモード等でストレージにアクセスできない場合はクラッシュさせず、
    // 抑制しない(= バナーを出してよい)安全側に倒す。
    return false;
  }
}
