/** @jest-environment node */

import {
  catalogRouteCopy,
  getCatalogRouteCopy,
} from "@/features/catalog/lib/route-copy";

describe("getCatalogRouteCopy", () => {
  test("ja は ja 文言を返す", () => {
    expect(getCatalogRouteCopy("ja")).toBe(catalogRouteCopy.ja);
  });

  test("en は en 文言を返す", () => {
    expect(getCatalogRouteCopy("en")).toBe(catalogRouteCopy.en);
  });

  test("未訳 locale (ko 等) は ja にフォールバックする (ADR-006)", () => {
    expect(getCatalogRouteCopy("ko")).toBe(catalogRouteCopy.ja);
    expect(getCatalogRouteCopy("zh-CN")).toBe(catalogRouteCopy.ja);
    expect(getCatalogRouteCopy("ar")).toBe(catalogRouteCopy.ja);
  });
});
