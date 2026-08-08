import { getTourSteps } from "@/features/tutorial/lib/tour-steps";

const COPY = {
  navigateTitle: "生成はここから！",
  navigateDescription: "ここをタップしてください。",
  presetTitle: "① スタイルを選択",
  presetDescription: "着せ替えたいスタイルを選択してください！",
  characterTitle: "② マイキャラ選択",
  characterDescription: "着せ替えたいキャラクターを選んでください！",
  generateTitle: "③ コーデを開始！",
  generateDescription: "選択すると生成が始まります！",
  finishedTitle: "ツアー完了！",
  finishedDescription: "お疲れ様でした！",
};

describe("getTourSteps (新規登録チュートリアル・5ステップ)", () => {
  test("①ナビ案内 → ②〜④は style ミニツアーのアンカー → ⑤締め、の順で5ステップ", () => {
    const steps = getTourSteps(COPY);
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.element)).toEqual([
      '[data-tour="coordinate-nav-mobile"]',
      '[data-tour="style-tour-preset"]',
      '[data-tour="style-tour-character"]',
      '[data-tour="style-tour-generate"]',
      undefined,
    ]);
  });

  test("文言が各ステップの popover に反映される", () => {
    const steps = getTourSteps(COPY);
    expect(steps[0].popover?.title).toBe(COPY.navigateTitle);
    expect(steps[1].popover?.title).toBe(COPY.presetTitle);
    expect(steps[2].popover?.description).toBe(COPY.characterDescription);
    expect(steps[3].popover?.title).toBe(COPY.generateTitle);
    expect(steps[4].popover?.title).toBe(COPY.finishedTitle);
  });

  test("⑤締めは要素なしの中央表示で「次へ(完了)」ボタンのみ", () => {
    const steps = getTourSteps(COPY);
    const finale = steps[4];
    expect(finale.element).toBeUndefined();
    expect(finale.popover?.showButtons).toEqual(["next"]);
    expect(finale.popover?.side).toBe("over");
  });
});
