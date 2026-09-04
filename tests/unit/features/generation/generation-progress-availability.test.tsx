/** @jest-environment jsdom */

/**
 * バックグラウンド生成進捗バー（PR #594）の段階公開。
 *
 * `PopularPromptsAvailabilityProvider` と同じ構造・同じテスト観点。
 * 実機の完全なE2E検証が未実施のため、本番でまず運営のみに見せる。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  GenerationProgressAvailabilityProvider,
  GenerationProgressAvailabilityUpgrade,
  useGenerationProgressAvailable,
} from "@/features/generation/components/GenerationProgressAvailabilityProvider";

const ORIGINAL_FLAG =
  process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED =
      ORIGINAL_FLAG;
  }
});

describe("GenerationProgressAvailabilityProvider", () => {
  function Probe() {
    return (
      <span data-testid="available">
        {String(useGenerationProgressAvailable())}
      </span>
    );
  }

  test("Providerの外で参照してもクラッシュせずfalseに倒れる", () => {
    // LocaleShell への追加を忘れた場合の落ち方。閉じる側に倒れるだけで壊れない
    delete process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED;

    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("初期値は公開フラグ", () => {
    process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED = "true";

    render(
      <GenerationProgressAvailabilityProvider>
        <Probe />
      </GenerationProgressAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("フラグOFFなら既定はfalse", () => {
    delete process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED;

    render(
      <GenerationProgressAvailabilityProvider>
        <Probe />
      </GenerationProgressAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("Upgradeはfalseからtrueへ昇格させる（表示は持たない）", () => {
    delete process.env.NEXT_PUBLIC_BACKGROUND_GENERATION_PROGRESS_ENABLED;

    const { container } = render(
      <GenerationProgressAvailabilityProvider>
        <Probe />
        <GenerationProgressAvailabilityUpgrade />
      </GenerationProgressAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
    // Upgrade 自体は何も描かない
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });
});
