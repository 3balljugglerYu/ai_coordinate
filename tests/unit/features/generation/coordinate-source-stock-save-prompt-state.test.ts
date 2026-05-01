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

  it("clearCoordinateSourceStockSavePrompt 経由で onSettled が呼ばれる", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );
    const onSettled = jest.fn();

    stateModule.showCoordinateSourceStockSavePrompt(
      {
        file: new File(["source"], "source.png", { type: "image/png" }),
        jobIds: ["job-1"],
      },
      { onSettled }
    );
    expect(onSettled).not.toHaveBeenCalled();

    stateModule.clearCoordinateSourceStockSavePrompt();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("setCoordinateSourceStockSavePromptPending(false) 経由でも onSettled が呼ばれる", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );
    const onSettled = jest.fn();

    stateModule.showCoordinateSourceStockSavePrompt(
      {
        file: new File(["source"], "source.png", { type: "image/png" }),
        jobIds: ["job-2"],
      },
      { onSettled }
    );
    stateModule.setCoordinateSourceStockSavePromptPending(false);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("「次回から表示しない」フラグ ON のときは即座に onSettled が呼ばれ pending にならない", async () => {
    window.localStorage.setItem(
      "persta-ai:coordinate-stock-save-prompt-dismissed",
      "true"
    );

    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );
    const onSettled = jest.fn();

    stateModule.showCoordinateSourceStockSavePrompt(
      {
        file: new File(["source"], "source.png", { type: "image/png" }),
        jobIds: ["job-3"],
      },
      { onSettled }
    );

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(stateModule.getCoordinateSourceStockSavePromptPending()).toBe(false);
  });

  it("onSettled は最大 1 回しか呼ばれない", async () => {
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );
    const onSettled = jest.fn();

    stateModule.showCoordinateSourceStockSavePrompt(
      {
        file: new File(["source"], "source.png", { type: "image/png" }),
        jobIds: ["job-4"],
      },
      { onSettled }
    );
    stateModule.clearCoordinateSourceStockSavePrompt();
    stateModule.setCoordinateSourceStockSavePromptPending(false);
    stateModule.clearCoordinateSourceStockSavePrompt();

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("onSettled が例外を投げても他のフローを止めない", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const stateModule = await import(
      "@/features/generation/lib/coordinate-source-stock-save-prompt-state"
    );
    const onSettled = jest.fn(() => {
      throw new Error("settled boom");
    });

    stateModule.showCoordinateSourceStockSavePrompt(
      {
        file: new File(["source"], "source.png", { type: "image/png" }),
        jobIds: ["job-5"],
      },
      { onSettled }
    );

    expect(() => stateModule.clearCoordinateSourceStockSavePrompt()).not.toThrow();
    expect(stateModule.getCoordinateSourceStockSavePromptPending()).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
