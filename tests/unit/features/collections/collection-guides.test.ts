import {
  collectionGuidePath,
  DEFAULT_COLLECTION_GUIDE_PATH,
} from "@/features/collections/lib/collection-guides";

describe("collectionGuidePath", () => {
  test("ことわざ辞典 上巻/下巻はどちらも /collections/kotowaza", () => {
    expect(collectionGuidePath("kotowaza_dictionary")).toBe(
      "/collections/kotowaza",
    );
    expect(collectionGuidePath("kotowaza_dictionary_2")).toBe(
      "/collections/kotowaza",
    );
  });

  test("イタリア旅行は /collections/italy", () => {
    expect(collectionGuidePath("travel_to_italy")).toBe("/collections/italy");
  });

  test("未登録カテゴリ・null は神コレのガイドにフォールバック", () => {
    expect(collectionGuidePath("unknown_category")).toBe(
      DEFAULT_COLLECTION_GUIDE_PATH,
    );
    expect(collectionGuidePath(null)).toBe(DEFAULT_COLLECTION_GUIDE_PATH);
    expect(collectionGuidePath(undefined)).toBe(DEFAULT_COLLECTION_GUIDE_PATH);
  });
});
