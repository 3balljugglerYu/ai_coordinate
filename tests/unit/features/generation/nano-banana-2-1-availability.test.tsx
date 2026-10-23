/** @jest-environment jsdom */

/**
 * Nano Banana 2.1 の段階公開(nano-banana-2-1 計画書 Phase 5)。
 *
 * GptImage25AvailabilityProvider と同じ構造・同じテスト観点。公開フラグ OFF では false、
 * 運営だけ Loader(サーバー側)の Upgrade で true に昇格する。
 * 実行可否はサーバー側 isNanoBanana21Available が正本で、ここは「見せる」層だけ。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  NanoBanana21AvailabilityProvider,
  NanoBanana21AvailabilityUpgrade,
  useNanoBanana21Available,
} from "@/features/generation/components/NanoBanana21AvailabilityProvider";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;
const LAUNCH_AT_MS = Date.parse("2026-10-24T00:00:00+09:00");

beforeEach(() => {
  // 既定は公開の 1 ミリ秒前(実行した日によって結果が変わらないように)
  jest.spyOn(Date, "now").mockReturnValue(LAUNCH_AT_MS - 1);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = ORIGINAL_FLAG;
  }
});

describe("NanoBanana21AvailabilityProvider", () => {
  function Probe() {
    return (
      <span data-testid="available">{String(useNanoBanana21Available())}</span>
    );
  }

  test("Providerの外で参照してもクラッシュせずfalseに倒れる", () => {
    // LocaleShell への追加を忘れた場合の落ち方。閉じる側に倒れるだけで壊れない
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;

    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("初期値は公開フラグ", () => {
    process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED = "true";

    render(
      <NanoBanana21AvailabilityProvider>
        <Probe />
      </NanoBanana21AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("フラグOFFなら既定はfalse(運営限定)", () => {
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;

    render(
      <NanoBanana21AvailabilityProvider>
        <Probe />
      </NanoBanana21AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("Upgradeはfalseからtrueへ昇格させる(表示は持たない)", () => {
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;

    const { container } = render(
      <NanoBanana21AvailabilityProvider>
        <Probe />
        <NanoBanana21AvailabilityUpgrade />
      </NanoBanana21AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
    // Upgrade 自体は何も描かない
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });

  test("公開の日時(2026-10-24 0:00 JST)を過ぎていれば、フラグが無くても表示のあとに true になる", () => {
    delete process.env.NEXT_PUBLIC_NANO_BANANA_2_1_ENABLED;
    jest.spyOn(Date, "now").mockReturnValue(LAUNCH_AT_MS);

    render(
      <NanoBanana21AvailabilityProvider>
        <Probe />
      </NanoBanana21AvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });
});
