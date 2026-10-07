/** @jest-environment jsdom */

/**
 * スマホの生成画面の外枠。
 * ⭐ 開いている間は全体の生成中バーを止め、離れるとき(×・ブラウザの戻る)に進行中のジョブを渡す
 * (シートの handleOpenChange と同じ役目)。
 */
import { fireEvent, render, screen } from "@testing-library/react";

const pauseMock = jest.fn();
const resumeMock = jest.fn();
const checkAndTrackMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/features/generation/lib/generation-progress-store", () => ({
  pauseGenerationProgressBar: () => pauseMock(),
  resumeGenerationProgressBarIfNeeded: () => resumeMock(),
  checkAndTrackInProgressJob: () => checkAndTrackMock(),
}));
const availableMock = jest.fn(() => true);
jest.mock("@/features/generation/components/GenerationProgressAvailabilityProvider", () => ({
  useGenerationProgressAvailable: () => availableMock(),
}));
const shownMock = jest.fn();
const closeMock = jest.fn();
const claimMock = jest.fn(() => true);
const peekMock = jest.fn(() => false);
jest.mock("@/features/generation/lib/generation-screen-transition", () => ({
  GENERATION_SCREEN_ATTRIBUTE: "data-generation-screen",
  notifyGenerationScreenShown: () => shownMock(),
  closeGenerationScreen: (...args: unknown[]) => closeMock(...args),
  claimOpenedFromApp: () => claimMock(),
  peekOpenedFromApp: () => peekMock(),
}));
const routerMock = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => routerMock }));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { GenerationScreenFrame } from "@/features/generation/components/GenerationScreenFrame";
import { GenerationScreenLoading } from "@/features/generation/components/GenerationScreenLoading";

beforeEach(() => {
  jest.clearAllMocks();
  availableMock.mockReturnValue(true);
});

describe("GenerationScreenFrame", () => {
  test("描かれたら開くアニメーションの合図を出し、上部に見出しと × を置く", () => {
    render(
      <GenerationScreenFrame title="このカタログで生成する" fallbackHref="/posts/a" handOffProgress>
        <p>body</p>
      </GenerationScreenFrame>,
    );
    expect(shownMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading").textContent).toBe("このカタログで生成する");
    expect(screen.getByTestId("generation-screen").hasAttribute("data-generation-screen")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "generationScreenClose" }));
    // アプリの中から開いたか(描かれたときに受け取った値)を渡す
    expect(claimMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledWith(routerMock, "/posts/a", true);
  });

  test("開いている間はバーを止め、離れるとき進行中のジョブを渡して解除する", () => {
    const { unmount } = render(
      <GenerationScreenFrame title="t" fallbackHref="/" handOffProgress>
        <p />
      </GenerationScreenFrame>,
    );
    expect(pauseMock).toHaveBeenCalledTimes(1);
    unmount();
    expect(checkAndTrackMock).toHaveBeenCalledTimes(1);
    expect(resumeMock).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["未ログイン(引き継がない)", true, false],
    ["生成中バーが無効", false, true],
  ])("%sなら、止めも引き継ぎもしない", (_label, available, handOff) => {
    availableMock.mockReturnValue(available);
    const { unmount } = render(
      <GenerationScreenFrame title="t" fallbackHref="/" handOffProgress={handOff}>
        <p />
      </GenerationScreenFrame>,
    );
    unmount();
    expect(pauseMock).not.toHaveBeenCalled();
    expect(checkAndTrackMock).not.toHaveBeenCalled();
    expect(resumeMock).not.toHaveBeenCalled();
  });
});

describe("GenerationScreenLoading", () => {
  test("読み込み中でも描かれたら開き始め、× で閉じられる", () => {
    render(<GenerationScreenLoading />);
    expect(shownMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "generationScreenClose" }));
    // 読み込み中は受け取らずに確かめる(このあと本体が受け取る)
    expect(peekMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledWith(routerMock, "/", false);
  });
});
