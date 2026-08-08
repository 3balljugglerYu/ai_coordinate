import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * 新規登録チュートリアルツアーの目的地(ツアー②〜④を表示する画面)。
 * ツアー進行中は、ナビの生成入口タップを直近モードに関わらずここへ固定する。
 */
export const TUTORIAL_TOUR_ENTRY_PATH = "/style";

/**
 * チュートリアルツアーが進行中(sessionStorage の in_progress が立っている)かを返す。
 *
 * ナビの「コーディネート」入口は通常「直近に使った生成モード」へ差し替え遷移するが、
 * ツアー進行中にそれをやると、直近モードのユーザーはツアーの再開先
 * (TUTORIAL_TOUR_ENTRY_PATH)に到達できず無言で詰まる。
 * ツアー中だけ遷移先を固定するための判定。
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
