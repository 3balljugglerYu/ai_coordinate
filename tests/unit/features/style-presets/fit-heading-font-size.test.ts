/**
 * カタログのページの見出し(h1)の文字の大きさ。
 *
 * ⭐ 見出しはどの言語でも1行に収める(2026-09-29 ユーザー指示)。入りきらない言語だけ
 * 文字を小さくする。3つのタブの見出しは同じ大きさにそろえる(タブを切り替えるたびに
 * 見出しの大きさが変わらないように、3つのうち一番長いものに合わせる)。
 */

import { fitHeadingFontSize } from "@/features/style-presets/lib/fit-heading-font-size";

const BASE = { basePx: 30, minPx: 20 };

describe("fitHeadingFontSize", () => {
  test("一番長い見出しも入るなら、大きさは変えない(null)", () => {
    expect(
      fitHeadingFontSize({ ...BASE, availablePx: 328, titleWidthsPx: [270, 240, 240] })
    ).toBeNull();
  });

  test("ちょうど入る幅なら、大きさは変えない(null)", () => {
    expect(
      fitHeadingFontSize({ ...BASE, availablePx: 328, titleWidthsPx: [328, 200] })
    ).toBeNull();
  });

  /*
    例: ベトナム語の「Danh mục của mọi người」は 30px で 360px 幅になり、幅 360px の
    スマホ(見出しに使える幅 328px)では入りきらない。一番長いものが入る大きさまで縮める。
  */
  test("一番長い見出しが入らないなら、入る大きさまで縮める", () => {
    // 30 * 328 / 360 = 27.33… → 27
    expect(
      fitHeadingFontSize({ ...BASE, availablePx: 328, titleWidthsPx: [248, 360, 204] })
    ).toBe(27);
  });

  // 四捨五入や切り上げだと、また入りきらなくなる
  test("小数は切り捨てる(28.94… → 28)", () => {
    expect(
      fitHeadingFontSize({ ...BASE, availablePx: 328, titleWidthsPx: [340] })
    ).toBe(28);
  });

  test.each([
    [[360, 248, 204]],
    [[248, 360, 204]],
    [[248, 204, 360]],
  ])("3つのうち一番長いものに合わせる(並び %j でも 27px)", (titleWidthsPx) => {
    expect(fitHeadingFontSize({ ...BASE, availablePx: 328, titleWidthsPx })).toBe(27);
  });

  test("最小の大きさより小さくはしない", () => {
    // 30 * 100 / 400 = 7.5 → 20 で止める
    expect(
      fitHeadingFontSize({ ...BASE, availablePx: 100, titleWidthsPx: [400] })
    ).toBe(20);
  });

  /*
    ⭐ 測れないとき(描画前・テストの jsdom・canvas が使えない)は縮めない。
    幅 0 で割ると大きさが 0 や Infinity になり、見出しが消える・崩れる。
  */
  test.each([
    ["使える幅が 0", 0, [300]],
    ["使える幅が NaN", Number.NaN, [300]],
    ["見出しの幅が測れない(空)", 328, []],
    ["見出しの幅が 0", 328, [0, 0]],
    ["見出しの幅が NaN", 328, [Number.NaN]],
    // 一部だけ測れた(0 や NaN が混ざる)ときも、まだ描画前とみなして縮めない
    ["0 が混ざる", 328, [0, 400]],
    ["NaN が混ざる", 328, [Number.NaN, 400]],
  ])("%s なら縮めない(null)", (_label, availablePx, titleWidthsPx) => {
    expect(
      fitHeadingFontSize({ ...BASE, availablePx, titleWidthsPx: titleWidthsPx as number[] })
    ).toBeNull();
  });
});
