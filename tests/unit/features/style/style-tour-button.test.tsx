/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { StyleTourButton } from "@/features/style/components/StyleTourButton";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

type DriverConfig = {
  steps: unknown[];
  popoverClass: string;
  disableActiveInteraction: boolean;
  onNextClick: (
    el: unknown,
    step: unknown,
    opts: { driver: unknown }
  ) => void;
  onPrevClick: (
    el: unknown,
    step: unknown,
    opts: { driver: unknown }
  ) => void;
  onHighlighted: (element: Element | undefined) => void;
  onDestroyed: () => void;
};

// driver.js のインスタンスを模した完全なモック。
// runTransitionFlow / 各コールバックは opts.driver を driverRef.current と
// 比較するため、ファクトリは毎回同じ driverInstance を返す。
const driverInstance = {
  drive: jest.fn(),
  destroy: jest.fn(),
  isLastStep: jest.fn(() => false),
  isFirstStep: jest.fn(() => false),
  getActiveIndex: jest.fn(() => 0),
  moveNext: jest.fn(),
  movePrevious: jest.fn(),
  getConfig: jest.fn(() => ({ steps: capturedConfig?.steps ?? [] })),
};

let capturedConfig: DriverConfig | null = null;
const mockDriverFactory = jest.fn((config: DriverConfig) => {
  capturedConfig = config;
  return driverInstance;
});

jest.mock("driver.js", () => ({
  driver: (config: unknown) => mockDriverFactory(config as DriverConfig),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

/** クリック → driver.js 起動完了を待ち、設定オブジェクトを返す */
async function startTourAndGetConfig(): Promise<DriverConfig> {
  fireEvent.click(screen.getByTestId("style-tour-button"));
  await waitFor(() => {
    expect(mockDriverFactory).toHaveBeenCalled();
  });
  if (!capturedConfig) {
    throw new Error("driver config was not captured");
  }
  return capturedConfig;
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedConfig = null;
  driverInstance.isLastStep.mockReturnValue(false);
  driverInstance.isFirstStep.mockReturnValue(false);
  driverInstance.getActiveIndex.mockReturnValue(0);
  document.body.removeAttribute("data-tour-transitioning");

  useTranslationsMock.mockImplementation(
    () => ((key: string) => key) as unknown as ReturnType<typeof useTranslations>,
  );
  // jsdom には matchMedia がないため、prefers-reduced-motion 判定用にモックする
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
  }) as unknown as typeof window.matchMedia;
  // jsdom 未実装のためモックする
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as unknown as typeof window.requestAnimationFrame;
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = jest.fn();
});

describe("StyleTourButton", () => {
  test("チュートリアルボタンが表示される", () => {
    render(<StyleTourButton />);
    expect(screen.getByTestId("style-tour-button")).toBeTruthy();
    expect(screen.getByText("tourButton")).toBeTruthy();
  });

  test("クリックすると3ステップのツアーが起動する", async () => {
    render(<StyleTourButton />);
    const config = await startTourAndGetConfig();

    expect(config.steps).toHaveLength(3);
    expect(config.popoverClass).toBe("style-tour-popover");
    expect(config.disableActiveInteraction).toBe(true);
    expect(driverInstance.drive).toHaveBeenCalledWith(0);
  });

  test("ツアー表示中に再クリックしても多重起動しない", async () => {
    render(<StyleTourButton />);
    const button = screen.getByTestId("style-tour-button");

    fireEvent.click(button);
    await waitFor(() => {
      expect(mockDriverFactory).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(button);
    // 遅延読み込みが解決する余地を与えてから回数を確認する
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockDriverFactory).toHaveBeenCalledTimes(1);
  });

  test("アンマウント時にツアーを破棄する", async () => {
    const { unmount } = render(<StyleTourButton />);
    await startTourAndGetConfig();

    unmount();
    expect(driverInstance.destroy).toHaveBeenCalledTimes(1);
  });

  test("onHighlighted はハイライト要素を画面中央へスクロールする", async () => {
    render(<StyleTourButton />);
    const config = await startTourAndGetConfig();

    const element = document.createElement("div");
    config.onHighlighted(element);

    expect(element.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" })
    );
  });

  test("最終ステップの onNextClick で破棄しスタイル選択へスクロールする", async () => {
    const preset = document.createElement("div");
    preset.setAttribute("data-tour", "style-tour-preset");
    document.body.appendChild(preset);

    render(<StyleTourButton />);
    const config = await startTourAndGetConfig();

    driverInstance.isLastStep.mockReturnValue(true);
    config.onNextClick(undefined, undefined, { driver: driverInstance });

    expect(driverInstance.destroy).toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" })
    );
    expect(driverInstance.moveNext).not.toHaveBeenCalled();

    document.body.removeChild(preset);
  });

  test("非最終ステップの onNextClick は対象へスクロールし遷移後に moveNext を呼ぶ", async () => {
    // 次ステップ（index 1）の対象要素を DOM に用意し、スクロール処理も通す
    const character = document.createElement("div");
    character.setAttribute("data-tour", "style-tour-character");
    document.body.appendChild(character);

    jest.useFakeTimers();
    try {
      render(<StyleTourButton />);
      const config = await startTourAndGetConfig();

      driverInstance.isLastStep.mockReturnValue(false);
      driverInstance.getActiveIndex.mockReturnValue(0);
      config.onNextClick(undefined, undefined, { driver: driverInstance });

      // 遷移中フラグが立ち、対象要素へスクロールし、タイマー前は moveNext 未呼び出し
      expect(document.body.getAttribute("data-tour-transitioning")).toBe("true");
      expect(character.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: "center" })
      );
      expect(driverInstance.moveNext).not.toHaveBeenCalled();

      jest.advanceTimersByTime(450);
      expect(driverInstance.moveNext).toHaveBeenCalledTimes(1);
      expect(document.body.hasAttribute("data-tour-transitioning")).toBe(false);
    } finally {
      jest.useRealTimers();
      document.body.removeChild(character);
    }
  });

  test("破棄済み driver には遷移後の moveNext を呼ばない", async () => {
    jest.useFakeTimers();
    try {
      const { unmount } = render(<StyleTourButton />);
      const config = await startTourAndGetConfig();

      driverInstance.isLastStep.mockReturnValue(false);
      config.onNextClick(undefined, undefined, { driver: driverInstance });

      // タイマー待機中にアンマウント（driverRef がクリアされる）
      unmount();
      jest.advanceTimersByTime(450);

      expect(driverInstance.moveNext).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("onPrevClick は最初のステップでは movePrevious を呼ばない", async () => {
    render(<StyleTourButton />);
    const config = await startTourAndGetConfig();

    driverInstance.isFirstStep.mockReturnValue(true);
    config.onPrevClick(undefined, undefined, { driver: driverInstance });

    expect(driverInstance.movePrevious).not.toHaveBeenCalled();
  });

  test("onPrevClick は遷移後に movePrevious を呼ぶ", async () => {
    jest.useFakeTimers();
    try {
      render(<StyleTourButton />);
      const config = await startTourAndGetConfig();

      driverInstance.isFirstStep.mockReturnValue(false);
      driverInstance.getActiveIndex.mockReturnValue(1);
      config.onPrevClick(undefined, undefined, { driver: driverInstance });

      jest.advanceTimersByTime(450);
      expect(driverInstance.movePrevious).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("onDestroyed は遷移中フラグを除去する", async () => {
    render(<StyleTourButton />);
    const config = await startTourAndGetConfig();

    document.body.setAttribute("data-tour-transitioning", "true");
    config.onDestroyed();

    expect(document.body.hasAttribute("data-tour-transitioning")).toBe(false);
  });

  test("起動時に例外が出てもエラーを握りつぶし、再起動できる", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      mockDriverFactory.mockImplementationOnce(() => {
        throw new Error("boom");
      });

      render(<StyleTourButton />);
      fireEvent.click(screen.getByTestId("style-tour-button"));
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      // finally で初期化フラグが戻るため、再クリックで起動できる
      fireEvent.click(screen.getByTestId("style-tour-button"));
      await waitFor(() => {
        expect(driverInstance.drive).toHaveBeenCalledWith(0);
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
