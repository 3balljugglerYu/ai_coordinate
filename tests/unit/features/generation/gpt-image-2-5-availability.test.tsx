/** @jest-environment jsdom */

/**
 * ChatGPT Images 2.5(gpt-image-2.5-flare)の段階公開(Phase 3)。
 *
 * `GenerationProgressAvailabilityProvider` と同じ構造・同じテスト観点。
 * 本番で運営だけが 2.5 を選べる状態にするため、公開フラグ OFF では false、
 * 運営だけ Loader(サーバー側)の Upgrade で true に昇格する。
 * 実行可否はサーバー側 isGptImage25Available が正本で、ここは「見せる」層だけ。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  GptImage25AvailabilityProvider,
  GptImage25AvailabilityUpgrade,
  useGptImage25Available,
} from "@/features/generation/components/GptImage25AvailabilityProvider";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED = ORIGINAL_FLAG;
  }
});

describe("GptImage25AvailabilityProvider", () => {
  function Probe() {
    return (
      <span data-testid="available">{String(useGptImage25Available())}</span>
    );
  }

  test("Providerの外で参照してもクラッシュせずfalseに倒れる", () => {
    // LocaleShell への追加を忘れた場合の落ち方。閉じる側に倒れるだけで壊れない
    delete process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED;

    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("初期値は公開フラグ", () => {
    process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED = "true";

    render(
      <GptImage25AvailabilityProvider>
        <Probe />
      </GptImage25AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("フラグOFFなら既定はfalse(運営限定)", () => {
    delete process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED;

    render(
      <GptImage25AvailabilityProvider>
        <Probe />
      </GptImage25AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("Upgradeはfalseからtrueへ昇格させる(表示は持たない)", () => {
    delete process.env.NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED;

    const { container } = render(
      <GptImage25AvailabilityProvider>
        <Probe />
        <GptImage25AvailabilityUpgrade />
      </GptImage25AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
    // Upgrade 自体は何も描かない
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });
});
