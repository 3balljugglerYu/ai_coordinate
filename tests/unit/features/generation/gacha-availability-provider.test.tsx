/**
 * User ORIGINAL の可否をクライアントへ配る context。
 *
 * ⭐ ここは「初期値＝公開フラグ」「運営だけ後から昇格」の2段構え。
 * 初期値を取り違えると一般公開後に「ガチャ」の札がちらつき、昇格が壊れると
 * 運営が公開前の確認をできなくなる。逆に Provider の外で true に倒れると、
 * context を置き忘れた面で**公開前の機能が誰にでも出る**。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  GachaAvailabilityProvider,
  GachaAvailabilityUpgrade,
  useGachaAvailable,
} from "@/features/generation/components/GachaAvailabilityProvider";

/** 可否をそのまま文字列で出すだけの覗き窓。 */
function Probe() {
  return <span data-testid="available">{String(useGachaAvailable())}</span>;
}

const ORIGINAL = process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED = ORIGINAL;
  }
});

describe("GachaAvailabilityProvider", () => {
  /*
    ⭐ Provider を置き忘れた面では**閉じる側**に倒す。
    開く側に倒すと、context の無いツリーで公開前の機能が出てしまう。
  */
  test("Provider の外では false", () => {
    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  /*
    Provider より外に置く面(投稿の進行バー・投稿ボーナスなど)も、一般公開後は
    刷新後の表記にそろえる。公開フラグが立つまでは上のとおり閉じたまま。
  */
  test("Provider の外でも、一般公開後は true", () => {
    process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED = "true";

    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("公開フラグが立っていなければ初期値は false", () => {
    delete process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED;

    render(
      <GachaAvailabilityProvider>
        <Probe />
      </GachaAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  /*
    ⭐ 一般公開後は**認証を待たずに**初期値で確定する。
    ここが false から始まると、全ページで「ガチャ」の札が一瞬消えてから出る。
  */
  test("公開フラグが立っていれば昇格を待たずに true", () => {
    process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED = "true";

    render(
      <GachaAvailabilityProvider>
        <Probe />
      </GachaAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("'true' 以外の値は立っていないものとして扱う", () => {
    process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED = "1";

    render(
      <GachaAvailabilityProvider>
        <Probe />
      </GachaAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  describe("昇格", () => {
    test("Upgrade を描くと false から true になる", () => {
      delete process.env.NEXT_PUBLIC_GACHA_PROMPT_ENABLED;

      render(
        <GachaAvailabilityProvider>
          <Probe />
          <GachaAvailabilityUpgrade />
        </GachaAvailabilityProvider>
      );

      expect(screen.getByTestId("available")).toHaveTextContent("true");
    });

    test("Upgrade 自体は何も描かない", () => {
      const { container } = render(
        <GachaAvailabilityProvider>
          <GachaAvailabilityUpgrade />
        </GachaAvailabilityProvider>
      );

      expect(container).toBeEmptyDOMElement();
    });

    /*
      ⭐ Provider の外で Upgrade が描かれても落ちないこと。
      サーバー側のローダーは Provider の位置を知らないので、
      配線を間違えたときに画面ごと落ちる作りにはしない。
    */
    test("Provider の外で描かれても例外にならない", () => {
      expect(() => render(<GachaAvailabilityUpgrade />)).not.toThrow();
    });
  });
});
