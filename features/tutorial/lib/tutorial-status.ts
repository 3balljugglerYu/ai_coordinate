import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * チュートリアルツアーが進行中(sessionStorage の in_progress が立っている)かを返す。
 *
 * ナビの「コーディネート」入口は通常「直近に使った生成モード」へ差し替え遷移するが、
 * ツアー進行中にそれをやると、直近が /style・/free のユーザーはツアーの再開先
 * (/coordinate)に到達できず無言で詰まる。ツアー中だけ差し替えを止めるための判定。
 */
export function isTutorialTourInProgress(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return (
      window.sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS) ===
      "true"
    );
  } catch {
    // プライベートモード等でストレージにアクセスできない場合は通常挙動に倒す。
    return false;
  }
}

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
