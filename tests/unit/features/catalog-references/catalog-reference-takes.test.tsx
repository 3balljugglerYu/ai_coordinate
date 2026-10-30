/**
 * @jest-environment jsdom
 *
 * 見本を入れたあとに出す部分(CatalogReferenceTakes)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10(第2案)
 *
 * ここで守ること:
 *  - 公開の前に運営が確認することを、帯で知らせる
 *  - まねるものは、名前と一行の説明つきのカードで、画面の案の並び(衣装・ポーズ・アングル・背景)に出す
 *  - 持つ順は、押した順ではなく決まった順(衣装・アングル・ポーズ・背景)
 *  - 0個なら選ぶように出す。まねないもの(顔・髪型・絵のタッチ)を書く
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { CatalogReferenceTakes } from "@/features/catalog-references/components/CatalogReferenceTakes";
import type { CatalogReferenceValue } from "@/features/catalog-references/components/CatalogReferencePicker";

const value: CatalogReferenceValue = { id: "ref-1", previewUrl: "blob:preview", takes: ["outfit"] };

test("確認の帯と、まねないものを出す", () => {
  render(<CatalogReferenceTakes value={value} onChange={jest.fn()} />);

  expect(screen.getByTestId("catalog-reference-review-banner").textContent).toBe("catalogReferenceReviewBanner");
  expect(screen.getByText("catalogReferenceNotTaken")).toBeTruthy();
  expect(screen.getByText("catalogReferenceNotTakenKeep")).toBeTruthy();
});

test("カードは画面の案の並びで、名前と説明つき。選んだものに印をつける", () => {
  render(<CatalogReferenceTakes value={{ ...value, takes: ["outfit", "background"] }} onChange={jest.fn()} />);

  const cards = screen.getAllByRole("checkbox");
  expect(cards.map((card) => card.textContent)).toEqual([
    "catalogReferenceTakeOutfitcatalogReferenceTakeOutfitHint",
    "catalogReferenceTakePosecatalogReferenceTakePoseHint",
    "catalogReferenceTakeAnglecatalogReferenceTakeAngleHint",
    "catalogReferenceTakeBackgroundcatalogReferenceTakeBackgroundHint",
  ]);
  expect(screen.getByRole("checkbox", { name: "catalogReferenceTakeOutfit" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("checkbox", { name: "catalogReferenceTakePose" }).getAttribute("aria-checked")).toBe("false");
  expect(
    screen.getByRole("checkbox", { name: "catalogReferenceTakeBackground", description: "catalogReferenceTakeBackgroundHint" }),
  ).toBeTruthy();
});

test("まねるものは、押した順ではなく決まった順(衣装・アングル・ポーズ・背景)で持つ", () => {
  const onChange = jest.fn();
  render(<CatalogReferenceTakes value={{ ...value, takes: ["background"] }} onChange={onChange} />);

  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakePose" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakeOutfit" }));

  expect(onChange).toHaveBeenNthCalledWith(1, { ...value, takes: ["pose", "background"] });
  expect(onChange).toHaveBeenNthCalledWith(2, { ...value, takes: ["outfit", "background"] });
});

test("最後の1つを外すと空にし、0個なら選ぶように出す", () => {
  const onChange = jest.fn();
  const { rerender } = render(<CatalogReferenceTakes value={value} onChange={onChange} />);
  expect(screen.queryByText("catalogReferenceTakesRequired")).toBeNull();

  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakeOutfit" }));
  expect(onChange).toHaveBeenCalledWith({ ...value, takes: [] });

  rerender(<CatalogReferenceTakes value={{ ...value, takes: [] }} onChange={onChange} />);
  expect(screen.getByText("catalogReferenceTakesRequired")).toBeTruthy();
});

test("生成している間は押せない", () => {
  const onChange = jest.fn();
  render(<CatalogReferenceTakes value={value} onChange={onChange} disabled />);

  fireEvent.click(screen.getByRole("checkbox", { name: "catalogReferenceTakePose" }));

  expect(onChange).not.toHaveBeenCalled();
});
