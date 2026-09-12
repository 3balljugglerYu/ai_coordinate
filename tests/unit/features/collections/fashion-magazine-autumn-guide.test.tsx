/** @jest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 秋号 LP の組版ガード。
 *
 * `writing-mode: vertical-rl` の中では、数字と欧文が既定で 90 度倒れる。
 * 実機で「全7ページ」の 7 が横倒しになり運営から指摘を受けたため、
 * 縦組みブロックに素の数字を書けないようテストで固定する。
 *
 * 直し方は `<Tcy>7</Tcy>`(text-combine-upright: all = 縦中横)。
 */
const SOURCE = readFileSync(
  path.join(
    process.cwd(),
    "features/collections/components/FashionMagazineAutumnGuide.tsx"
  ),
  "utf8"
);

/** 縦組み指定から、その要素を閉じる </section> までを取り出す。 */
function extractVerticalBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /writingMode: "vertical-rl"[\s\S]*?<\/section>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

describe("FashionMagazineAutumnGuide の縦組み", () => {
  test("縦組みブロックが存在する", () => {
    expect(extractVerticalBlocks(SOURCE).length).toBeGreaterThan(0);
  });

  test("⭐ 縦組みの中に、縦中横で囲っていない数字を書かない", () => {
    for (const block of extractVerticalBlocks(SOURCE)) {
      // <Tcy>…</Tcy> で囲まれたものは対象外
      const withoutTcy = block.replace(/<Tcy>[^<]*<\/Tcy>/g, "");
      // JSX のテキストノード(> … <)に現れる素の数字を探す
      const bare = [...withoutTcy.matchAll(/>([^<>]*\d[^<>]*)</g)].map(
        (m) => m[1].trim()
      );
      expect(bare).toEqual([]);
    }
  });

  test("縦中横のヘルパーが text-combine-upright を使っている", () => {
    expect(SOURCE).toContain('textCombineUpright: "all"');
  });
});
