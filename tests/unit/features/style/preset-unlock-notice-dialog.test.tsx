/** @jest-environment jsdom */

/**
 * まだ使えないスタイルを押したときの案内(`PresetUnlockNoticeDialog`)。
 * 投稿詳細のカードと /styles のカードで共用する(計画書 ADR-010)。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PresetUnlockNoticeDialog } from "@/features/style/components/PresetUnlockNoticeDialog";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function renderNotice(unlockState: PresetUnlockState) {
  const onOpenChange = jest.fn();
  const onLogin = jest.fn();
  render(
    <PresetUnlockNoticeDialog
      open
      onOpenChange={onOpenChange}
      unlockState={unlockState}
      onLogin={onLogin}
    />
  );
  return { onOpenChange, onLogin };
}

describe("PresetUnlockNoticeDialog", () => {
  test.each([
    [
      "順番待ち",
      { status: "locked", reason: "sequential" } as const,
      "presetLockedTitle",
      "presetLockedSequentialDescription",
    ],
    [
      "前の企画が未完走",
      { status: "locked", reason: "prerequisite" } as const,
      "presetLockedTitle",
      "presetLockedPrerequisiteDescription",
    ],
    [
      "会期終了",
      { status: "ended" } as const,
      "presetEndedTitle",
      "presetEndedDescription",
    ],
  ])("%sの案内を出し、OKで閉じる", (_label, unlockState, title, description) => {
    const { onOpenChange, onLogin } = renderNotice(unlockState);

    const notice = screen.getByTestId("one-tap-style-locked-notice");
    expect(notice.textContent).toContain(title);
    expect(notice.textContent).toContain(description);
    expect(
      screen.queryByRole("button", { name: "presetLoginRequiredAction" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "presetLockedAction" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onLogin).not.toHaveBeenCalled();
  });

  test("未ログインは「ログインすれば使える」と伝え、ログインを押せる", () => {
    const { onLogin } = renderNotice({ status: "login_required" });

    const notice = screen.getByTestId("one-tap-style-locked-notice");
    expect(notice.textContent).toContain("presetLoginRequiredTitle");
    expect(notice.textContent).toContain("presetLoginRequiredDescription");

    fireEvent.click(
      screen.getByRole("button", { name: "presetLoginRequiredAction" })
    );
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
