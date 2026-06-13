import { isTutorialActiveOrPending } from "@/features/tutorial/lib/tutorial-status";

describe("isTutorialActiveOrPending", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("ツアー進行中(in_progress)なら true", () => {
    window.sessionStorage.setItem("tutorial_in_progress", "true");
    expect(
      isTutorialActiveOrPending({
        isAuthenticated: true,
        tutorialCompleted: true,
      }),
    ).toBe(true);
  });

  it("ログイン済み・未完了・未スキップなら true(開始モーダルが出る)", () => {
    expect(
      isTutorialActiveOrPending({
        isAuthenticated: true,
        tutorialCompleted: false,
      }),
    ).toBe(true);
  });

  it("完了済みなら false", () => {
    expect(
      isTutorialActiveOrPending({
        isAuthenticated: true,
        tutorialCompleted: true,
      }),
    ).toBe(false);
  });

  it("スキップ(declined)済みなら false(バナーを出してよい)", () => {
    window.localStorage.setItem("tutorial_declined", "true");
    expect(
      isTutorialActiveOrPending({
        isAuthenticated: true,
        tutorialCompleted: false,
      }),
    ).toBe(false);
  });

  it("未ログインなら false", () => {
    expect(
      isTutorialActiveOrPending({
        isAuthenticated: false,
        tutorialCompleted: false,
      }),
    ).toBe(false);
  });
});
