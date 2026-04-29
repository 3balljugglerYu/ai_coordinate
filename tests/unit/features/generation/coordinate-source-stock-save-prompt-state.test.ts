/** @jest-environment jsdom */

describe("coordinate-source-stock-save-prompt-state", () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
  });

  it("投稿後保存モーダルを表示しただけではコーディネート導線の赤丸を付けない", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );

    stateModule.showCoordinateSourceStockSavePrompt({
      file: new File(["source"], "source.png", { type: "image/png" }),
      jobIds: ["job-1"],
    });

    expect(stateModule.getCoordinateSourceStockSavePromptState()).toMatchObject(
      {
        pending: true,
        coordinateNavDot: false,
      },
    );
    expect(stateModule.getCoordinateSourceStockSavePromptDot()).toBe(false);
  });

  it("投稿後保存モーダルで保存完了した後は閉じてもコーディネート導線の赤丸が残る", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );

    stateModule.showCoordinateSourceStockSavePrompt({
      file: new File(["source"], "source.png", { type: "image/png" }),
      jobIds: ["job-1"],
    });
    stateModule.markCoordinateSourceStockSavePromptDot();

    stateModule.clearCoordinateSourceStockSavePrompt();

    expect(stateModule.getCoordinateSourceStockSavePromptState()).toMatchObject(
      {
        pending: false,
        batch: null,
        coordinateNavDot: true,
      },
    );
    expect(stateModule.getCoordinateSourceStockSavePromptDot()).toBe(true);
  });

  it("投稿後保存モーダルを保存せず閉じるとコーディネート導線の赤丸も消える", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );

    stateModule.showCoordinateSourceStockSavePrompt({
      file: new File(["source"], "source.png", { type: "image/png" }),
      jobIds: ["job-1"],
    });

    stateModule.clearCoordinateSourceStockSavePrompt();

    expect(stateModule.getCoordinateSourceStockSavePromptState()).toMatchObject(
      {
        pending: false,
        batch: null,
        coordinateNavDot: false,
      },
    );
    expect(stateModule.getCoordinateSourceStockSavePromptDot()).toBe(false);
  });

  it("コーディネート画面表示時の明示クリアで赤丸を消す", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );

    stateModule.showCoordinateSourceStockSavePrompt({
      file: new File(["source"], "source.png", { type: "image/png" }),
      jobIds: ["job-1"],
    });
    stateModule.markCoordinateSourceStockSavePromptDot();
    stateModule.clearCoordinateSourceStockSavePrompt();

    stateModule.clearCoordinateSourceStockSavePromptDot();

    expect(stateModule.getCoordinateSourceStockSavePromptDot()).toBe(false);
    expect(stateModule.getCoordinateSourceStockSavePromptState()).toMatchObject(
      {
        pending: false,
        batch: null,
        coordinateNavDot: false,
      },
    );
  });

  it("ローカルのモーダル開閉状態だけではコーディネート導線の赤丸を付けない", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );

    stateModule.setCoordinateSourceStockSavePromptPending(true);

    expect(stateModule.getCoordinateSourceStockSavePromptPending()).toBe(true);
    expect(stateModule.getCoordinateSourceStockSavePromptDot()).toBe(false);
  });
});
