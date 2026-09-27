import {
  GENERATION_MODE_PATHS,
  LAST_GENERATION_MODE_STORAGE_KEY,
  getLastGenerationModePath,
  isGenerationModePath,
  setLastGenerationModePath,
} from "@/features/generation/lib/generation-mode-preference";

describe("generation-mode-preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("未保存時の既定は /style (新規ユーザーの初回着地を One-Tap Style に寄せる)", () => {
    expect(getLastGenerationModePath()).toBe(GENERATION_MODE_PATHS.style);
  });

  test("保存済みの直近モードを返す", () => {
    setLastGenerationModePath(GENERATION_MODE_PATHS.free);
    expect(getLastGenerationModePath()).toBe("/free");
    setLastGenerationModePath(GENERATION_MODE_PATHS.style);
    expect(getLastGenerationModePath()).toBe("/style");
  });

  test("廃止した Coordinate の保存値は Free Style として読む", () => {
    // 廃止前にタブが書いた値(書き手は components/GenerationModeTabs.tsx)
    window.localStorage.setItem(LAST_GENERATION_MODE_STORAGE_KEY, "/coordinate");
    expect(getLastGenerationModePath()).toBe("/free");
  });

  test("不正な保存値は既定 /style に倒す", () => {
    window.localStorage.setItem(LAST_GENERATION_MODE_STORAGE_KEY, "/unknown-path");
    expect(getLastGenerationModePath()).toBe("/style");
  });

  test("localStorage を読めない環境(プライベートモード等)では既定 /style に倒す", () => {
    window.localStorage.setItem(LAST_GENERATION_MODE_STORAGE_KEY, "/free");
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(getLastGenerationModePath()).toBe("/style");
  });

  test("localStorage に書けない環境でも例外を外へ出さない", () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => setLastGenerationModePath("/free")).not.toThrow();
    // 書こうとはした(黙って握りつぶしたのであって、呼ばなかったのではない)
    expect(setItem).toHaveBeenCalledWith(LAST_GENERATION_MODE_STORAGE_KEY, "/free");
  });

  test("isGenerationModePath は /style と /free だけ真", () => {
    expect(isGenerationModePath("/style")).toBe(true);
    expect(isGenerationModePath("/free")).toBe(true);
    expect(isGenerationModePath("/coordinate")).toBe(false);
    expect(isGenerationModePath("/dashboard")).toBe(false);
    expect(isGenerationModePath(null)).toBe(false);
  });
});
