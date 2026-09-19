/**
 * User ORIGINAL の可否をクライアントへ配る context。
 *
 * ⭐ ここは「初期値＝公開フラグ」「運営だけ後から昇格」の2段構え。
 * 初期値を取り違えると一般公開後にトグルがちらつき、昇格が壊れると
 * 運営が公開前の確認をできなくなる。逆に Provider の外で true に倒れると、
 * context を置き忘れた面で**公開前の機能が誰にでも出る**。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  UserStylesAvailabilityProvider,
  UserStylesAvailabilityUpgrade,
  useUserStylesAvailable,
} from "@/features/user-styles/components/UserStylesAvailabilityProvider";

/** 可否をそのまま文字列で出すだけの覗き窓。 */
function Probe() {
  return <span data-testid="available">{String(useUserStylesAvailable())}</span>;
}

const ORIGINAL = process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = ORIGINAL;
  }
});

describe("UserStylesAvailabilityProvider", () => {
  /*
    ⭐ Provider を置き忘れた面では**閉じる側**に倒す。
    開く側に倒すと、context の無いツリーで公開前の機能が出てしまう。
  */
  test("Provider の外では false", () => {
    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("公開フラグが立っていなければ初期値は false", () => {
    delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;

    render(
      <UserStylesAvailabilityProvider>
        <Probe />
      </UserStylesAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  /*
    ⭐ 一般公開後は**認証を待たずに**初期値で確定する。
    ここが false から始まると、全ページでトグルが一瞬消えてから出る。
  */
  test("公開フラグが立っていれば昇格を待たずに true", () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";

    render(
      <UserStylesAvailabilityProvider>
        <Probe />
      </UserStylesAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("'true' 以外の値は立っていないものとして扱う", () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "1";

    render(
      <UserStylesAvailabilityProvider>
        <Probe />
      </UserStylesAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  describe("昇格", () => {
    test("Upgrade を描くと false から true になる", () => {
      delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;

      render(
        <UserStylesAvailabilityProvider>
          <Probe />
          <UserStylesAvailabilityUpgrade />
        </UserStylesAvailabilityProvider>
      );

      expect(screen.getByTestId("available")).toHaveTextContent("true");
    });

    test("Upgrade 自体は何も描かない", () => {
      const { container } = render(
        <UserStylesAvailabilityProvider>
          <UserStylesAvailabilityUpgrade />
        </UserStylesAvailabilityProvider>
      );

      expect(container).toBeEmptyDOMElement();
    });

    /*
      ⭐ Provider の外で Upgrade が描かれても落ちないこと。
      サーバー側のローダーは Provider の位置を知らないので、
      配線を間違えたときに画面ごと落ちる作りにはしない。
    */
    test("Provider の外で描かれても例外にならない", () => {
      expect(() => render(<UserStylesAvailabilityUpgrade />)).not.toThrow();
    });
  });
});
