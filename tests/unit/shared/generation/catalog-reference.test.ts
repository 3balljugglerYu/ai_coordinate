/**
 * 見本(参照画像)つきのカタログの指示文(buildCatalogReferenceDirective)と、まねるものの一覧。
 *
 * ここで守ること(計画書 ADR-007):
 *  - 選んだまねるものだけ、Inspire の「image_1 の〜を image_0 に」の文を、衣装 → アングル → ポーズ → 背景の順で足す
 *  - 選ばなかったものに「変えない」の文は足さない(作者のプロンプトとぶつけない)
 *  - 最後に必ず「見本の人物の顔・髪型などは使わない」を足す
 *  - まねるものが無ければ空。運営が直した文(templates)があればそちらを使う
 *  - まねるものの値は DB の CHECK と同じ4つ
 */

import { CATALOG_REFERENCE_TAKES } from "@/shared/generation/catalog-reference";
import { buildCatalogReferenceDirective } from "@/shared/generation/prompt-core";
import { PROMPT_REGISTRY } from "@/shared/generation/prompt-registry";

const on = (take: string) =>
  PROMPT_REGISTRY[`inspire.${take}_on` as keyof typeof PROMPT_REGISTRY].defaultContent;
const GUARD = PROMPT_REGISTRY["free.catalog_reference_person_guard"].defaultContent;

test("まねるものは DB の CHECK と同じ4つ", () => {
  expect([...CATALOG_REFERENCE_TAKES].sort()).toEqual(["angle", "background", "outfit", "pose"]);
});

test("選んだものだけを決まった順で足し、最後に人物の守りを足す", () => {
  expect(buildCatalogReferenceDirective({ takes: ["background", "outfit"] })).toBe(
    [on("outfit"), on("background"), GUARD].join("\n\n"),
  );
});

test("選ばなかったものに「変えない」の文は足さない", () => {
  const directive = buildCatalogReferenceDirective({ takes: ["pose"] });

  expect(directive).not.toContain(
    PROMPT_REGISTRY["inspire.background_off"].defaultContent,
  );
  expect(directive).not.toContain(PROMPT_REGISTRY["inspire.outfit_off"].defaultContent);
});

test("まねるものが無ければ空(知らない値も無視する)", () => {
  expect(buildCatalogReferenceDirective({ takes: [] })).toBe("");
  expect(buildCatalogReferenceDirective({ takes: ["face"] })).toBe("");
});

test("運営が直した文があれば、そちらを使う", () => {
  expect(
    buildCatalogReferenceDirective({
      takes: ["outfit"],
      templates: { "inspire.outfit_on": "服をまねる", "free.catalog_reference_person_guard": "人はまねない" },
    }),
  ).toBe("服をまねる\n\n人はまねない");
});
