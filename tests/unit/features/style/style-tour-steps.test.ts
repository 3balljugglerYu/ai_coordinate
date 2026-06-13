import { getStyleTourSteps } from "@/features/style/lib/style-tour-steps";

const COPY = {
  presetTitle: "① スタイルを選択",
  presetDescription: "着せ替えたいスタイルを選択してください！",
  characterTitle: "② マイキャラ選択",
  characterDescription: "着せ替えたいキャラクターを選んでください！",
  generateTitle: "③ コーデを開始！",
  generateDescription: "選択すると生成が始まります！あとは待つだけ！",
};

describe("getStyleTourSteps", () => {
  test("スタイル選択→マイキャラ選択→コーデ開始の3ステップを返す", () => {
    const steps = getStyleTourSteps(COPY);

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.element)).toEqual([
      '[data-tour="style-tour-preset"]',
      '[data-tour="style-tour-character"]',
      '[data-tour="style-tour-generate"]',
    ]);
  });

  test("各ステップのポップオーバーに渡したコピーが設定される", () => {
    const steps = getStyleTourSteps(COPY);

    expect(steps[0].popover).toMatchObject({
      title: COPY.presetTitle,
      description: COPY.presetDescription,
    });
    expect(steps[1].popover).toMatchObject({
      title: COPY.characterTitle,
      description: COPY.characterDescription,
    });
    expect(steps[2].popover).toMatchObject({
      title: COPY.generateTitle,
      description: COPY.generateDescription,
    });
  });
});
