/** @jest-environment node */

/**
 * サーバー描画(window が無い)でも読み書きが落ちないこと。
 * ナビの生成入口とタブはクライアントで動くが、同じモジュールがサーバー側の
 * 描画経路から読み込まれても例外にしない。
 */

import {
  getLastGenerationModePath,
  setLastGenerationModePath,
} from "@/features/generation/lib/generation-mode-preference";

describe("generation-mode-preference (window が無い環境)", () => {
  test("前回のモードは既定の /style を返す", () => {
    expect(typeof window).toBe("undefined");
    expect(getLastGenerationModePath()).toBe("/style");
  });

  test("保存しようとしても例外を出さない", () => {
    expect(() => setLastGenerationModePath("/free")).not.toThrow();
  });
});
