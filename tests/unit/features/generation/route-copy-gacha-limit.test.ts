/**
 * 生成の受付で、ガチャの候補が上限を超えたときに返す文言(15言語)。
 * 画面では超えると送れないので、直接送られたときにだけ使う。どの言語でも上限の数が入ること。
 */

import { locales } from "@/i18n/config";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import { GACHA_MAX_CANDIDATES } from "@/shared/generation/gacha-prompt";

describe("gachaTooManyCandidates", () => {
  test.each(locales)("%s: 上限の数を入れた文を返す", (locale) => {
    const message = getGenerationRouteCopy(locale).gachaTooManyCandidates(GACHA_MAX_CANDIDATES);
    expect(message).toContain(String(GACHA_MAX_CANDIDATES));
    expect(message).not.toContain("${");
  });
});
