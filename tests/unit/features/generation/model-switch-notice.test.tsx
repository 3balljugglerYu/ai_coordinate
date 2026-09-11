/** @jest-environment jsdom */

import { render, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import {
  MODEL_SELECT_TOUR_TARGET,
  ModelSwitchNotice,
} from "@/features/generation/components/ModelSwitchNotice";
import { MODEL_SWITCH_NOTICE_SEEN_KEY } from "@/features/generation/lib/form-preferences";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

type DriverConfig = {
  steps: Array<{
    element: Element;
    popover: { title: string; description: string };
  }>;
  popoverClass: string;
  animate: boolean;
  allowClose: boolean;
  nextBtnText: string;
  onDestroyed: () => void;
};

const driverInstance = { drive: jest.fn(), destroy: jest.fn() };
let capturedConfig: DriverConfig | null = null;
const mockDriverFactory = jest.fn((config: DriverConfig) => {
  capturedConfig = config;
  return driverInstance;
});

jest.mock("driver.js", () => ({
  driver: (config: unknown) => mockDriverFactory(config as DriverConfig),
}));
// CSS の動的 import は jest が解決できないので空モジュールにする
jest.mock("driver.js/dist/driver.css", () => ({}), { virtual: true });

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

/** スポットライトの対象（モデルセレクター）を DOM に用意する */
function mountTarget(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-tour", "tour-model-select");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  capturedConfig = null;
  document.body.innerHTML = "";
  window.localStorage.clear();

  useTranslationsMock.mockImplementation(
    () =>
      ((key: string) => key) as unknown as ReturnType<typeof useTranslations>
  );
  // jsdom に matchMedia は無い。prefers-reduced-motion 判定用に足す。
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

/** 起動待ちのタイマー(300ms)を進めて driver の生成を待つ */
async function advanceAndFlush() {
  await jest.advanceTimersByTimeAsync(400);
}

describe("ModelSwitchNotice", () => {
  test("open=false のときは何も出さない", async () => {
    mountTarget();
    render(<ModelSwitchNotice open={false} onClose={jest.fn()} />);
    await advanceAndFlush();

    expect(mockDriverFactory).not.toHaveBeenCalled();
  });

  test("open=true でモデルセレクターにスポットライトを当てる", async () => {
    const target = mountTarget();
    render(<ModelSwitchNotice open onClose={jest.fn()} />);
    await advanceAndFlush();

    await waitFor(() => expect(mockDriverFactory).toHaveBeenCalledTimes(1));
    expect(driverInstance.drive).toHaveBeenCalledWith(0);

    const config = capturedConfig!;
    expect(config.steps).toHaveLength(1);
    expect(config.steps[0].element).toBe(target);
    expect(config.steps[0].popover.title).toBe("modelSwitchNoticeTitle");
    expect(config.steps[0].popover.description).toBe("modelSwitchNoticeBody");
    expect(config.nextBtnText).toBe("modelSwitchNoticeConfirm");
    // Persta 共通のトーンを使う
    expect(config.popoverClass).toBe("persta-tour-popover");
  });

  test("⭐ 対象が無い画面（モデル選択を出さないカテゴリ）では出さない", async () => {
    // mountTarget を呼ばない = data-tour="tour-model-select" が存在しない
    render(<ModelSwitchNotice open onClose={jest.fn()} />);
    await advanceAndFlush();

    expect(mockDriverFactory).not.toHaveBeenCalled();
  });

  test("⭐ 他のモーダルが開いているときは出さない（次回に持ち越す）", async () => {
    mountTarget();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    render(<ModelSwitchNotice open onClose={jest.fn()} />);
    await advanceAndFlush();

    // driver.js のオーバーレイは z-index が高く、開いている導線を潰してしまう
    expect(mockDriverFactory).not.toHaveBeenCalled();
    // 出していないので「案内済み」にもしない
    expect(window.localStorage.getItem(MODEL_SWITCH_NOTICE_SEEN_KEY)).toBeNull();
  });

  test("⭐ 閉じたら案内済みとして記録し、onClose を呼ぶ（毎回出さないため）", async () => {
    mountTarget();
    const onClose = jest.fn();
    render(<ModelSwitchNotice open onClose={onClose} />);
    await advanceAndFlush();
    await waitFor(() => expect(mockDriverFactory).toHaveBeenCalled());

    expect(window.localStorage.getItem(MODEL_SWITCH_NOTICE_SEEN_KEY)).toBeNull();

    capturedConfig!.onDestroyed();

    expect(window.localStorage.getItem(MODEL_SWITCH_NOTICE_SEEN_KEY)).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("prefers-reduced-motion のときはアニメーションを切る", async () => {
    mountTarget();
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    render(<ModelSwitchNotice open onClose={jest.fn()} />);
    await advanceAndFlush();
    await waitFor(() => expect(mockDriverFactory).toHaveBeenCalled());

    expect(capturedConfig!.animate).toBe(false);
  });

  test("アンマウントしたら driver を破棄する（画面遷移で取り残さない）", async () => {
    mountTarget();
    const { unmount } = render(<ModelSwitchNotice open onClose={jest.fn()} />);
    await advanceAndFlush();
    await waitFor(() => expect(mockDriverFactory).toHaveBeenCalled());

    unmount();
    expect(driverInstance.destroy).toHaveBeenCalled();
  });

  test("スポットライトの対象セレクターは GenerationModelControls の data-tour と一致する", () => {
    expect(MODEL_SELECT_TOUR_TARGET).toBe('[data-tour="tour-model-select"]');
  });
});
