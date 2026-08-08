import {
  GENERATION_MODE_PATHS,
  getLastGenerationModePath,
  isGenerationModePath,
  setLastGenerationModePath,
} from "@/features/generation/lib/generation-mode-preference";

describe("generation-mode-preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("未保存時の既定は /style (新規ユーザーの初回着地を One-Tap Style に寄せる)", () => {
    expect(getLastGenerationModePath()).toBe(GENERATION_MODE_PATHS.style);
  });

  test("保存済みの直近モードを返す", () => {
    setLastGenerationModePath(GENERATION_MODE_PATHS.free);
    expect(getLastGenerationModePath()).toBe("/free");
    setLastGenerationModePath(GENERATION_MODE_PATHS.coordinate);
    expect(getLastGenerationModePath()).toBe("/coordinate");
  });

  test("不正な保存値は既定 /style に倒す", () => {
    window.localStorage.setItem(
      "persta-ai:last-generation-mode",
      "/unknown-path",
    );
    expect(getLastGenerationModePath()).toBe("/style");
  });

  test("isGenerationModePath は3ルートのみ真", () => {
    expect(isGenerationModePath("/style")).toBe(true);
    expect(isGenerationModePath("/free")).toBe(true);
    expect(isGenerationModePath("/coordinate")).toBe(true);
    expect(isGenerationModePath("/dashboard")).toBe(false);
    expect(isGenerationModePath(null)).toBe(false);
  });
});
