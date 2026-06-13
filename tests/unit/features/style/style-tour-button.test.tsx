/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { StyleTourButton } from "@/features/style/components/StyleTourButton";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

const mockDrive = jest.fn();
const mockDestroy = jest.fn();
const mockDriverFactory = jest.fn((config: unknown) => {
  void config;
  return {
    drive: mockDrive,
    destroy: mockDestroy,
  };
});

jest.mock("driver.js", () => ({
  driver: (config: unknown) => mockDriverFactory(config),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

beforeEach(() => {
  jest.clearAllMocks();
  useTranslationsMock.mockImplementation(
    () => ((key: string) => key) as unknown as ReturnType<typeof useTranslations>,
  );
  // jsdom には matchMedia がないため、prefers-reduced-motion 判定用にモックする
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
  }) as unknown as typeof window.matchMedia;
});

describe("StyleTourButton", () => {
  test("チュートリアルボタンが表示される", () => {
    render(<StyleTourButton />);
    expect(screen.getByTestId("style-tour-button")).toBeTruthy();
    expect(screen.getByText("tourButton")).toBeTruthy();
  });

  test("クリックすると3ステップのツアーが起動する", async () => {
    render(<StyleTourButton />);

    fireEvent.click(screen.getByTestId("style-tour-button"));

    await waitFor(() => {
      expect(mockDriverFactory).toHaveBeenCalledTimes(1);
    });

    const config = mockDriverFactory.mock.calls[0]?.[0] as {
      steps: unknown[];
      popoverClass: string;
      disableActiveInteraction: boolean;
    };
    expect(config.steps).toHaveLength(3);
    expect(config.popoverClass).toBe("style-tour-popover");
    expect(config.disableActiveInteraction).toBe(true);
    expect(mockDrive).toHaveBeenCalledWith(0);
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

    fireEvent.click(screen.getByTestId("style-tour-button"));
    await waitFor(() => {
      expect(mockDriverFactory).toHaveBeenCalledTimes(1);
    });

    unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
