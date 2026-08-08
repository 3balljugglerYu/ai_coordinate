import {
  isTutorialActiveOrPending,
  isTutorialTourInProgress,
} from "@/features/tutorial/lib/tutorial-status";

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

  it("ストレージアクセスが例外でも false を返す(クラッシュさせない)", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(
      isTutorialActiveOrPending({
        isAuthenticated: true,
        tutorialCompleted: false,
      }),
    ).toBe(false);

    spy.mockRestore();
  });
});

describe("isTutorialTourInProgress", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("in_progress が true なら true(ナビの直近モード復帰を止める)", () => {
    window.sessionStorage.setItem("tutorial_in_progress", "true");
    expect(isTutorialTourInProgress()).toBe(true);
  });

  it("未設定・別値なら false(通常のモード復帰を行う)", () => {
    expect(isTutorialTourInProgress()).toBe(false);
    window.sessionStorage.setItem("tutorial_in_progress", "false");
    expect(isTutorialTourInProgress()).toBe(false);
  });

  it("sessionStorage が例外を投げる場合は false(通常挙動に倒す)", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      expect(isTutorialTourInProgress()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
