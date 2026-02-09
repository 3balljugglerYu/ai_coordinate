export const REPORT_TAXONOMY = [
  {
    id: "rights",
    label: "権利侵害の可能性",
    subcategories: [
      { id: "copyright", label: "著作権（既存キャラ・作品IP）" },
      { id: "trademark", label: "商標（ロゴ・ブランド）" },
      { id: "publicity", label: "肖像権・パブリシティ（実在人物・著名人）" },
    ],
  },
  {
    id: "sexual",
    label: "性的・ヌード",
    subcategories: [
      { id: "adult_sexual", label: "成人向けの性的表現" },
      { id: "minor_sexual", label: "未成年に見える性的表現" },
      { id: "sexual_exploitation", label: "性的搾取の疑い" },
    ],
  },
  {
    id: "violence",
    label: "暴力・グロ",
    subcategories: [
      { id: "gore", label: "流血・重傷の描写" },
      { id: "cruelty", label: "残虐・拷問の描写" },
      { id: "animal_abuse", label: "動物虐待" },
    ],
  },
  {
    id: "harassment",
    label: "ヘイト・ハラスメント",
    subcategories: [
      { id: "hate", label: "差別・ヘイト表現" },
      { id: "threat", label: "脅迫・嫌がらせ" },
      { id: "bullying", label: "いじめ" },
    ],
  },
  {
    id: "danger",
    label: "危険・違法行為",
    subcategories: [
      { id: "self_harm", label: "自傷・自殺の助長" },
      { id: "illegal_goods", label: "違法薬物・武器の描写/宣伝" },
      { id: "crime", label: "犯罪の助長" },
    ],
  },
  {
    id: "spam_fraud",
    label: "詐欺・スパム",
    subcategories: [
      { id: "fraud", label: "詐欺・なりすまし" },
      { id: "spam", label: "迷惑投稿・大量投稿" },
      { id: "scam_link", label: "不審な外部誘導" },
    ],
  },
  {
    id: "other",
    label: "その他",
    subcategories: [{ id: "other", label: "その他（詳細を記入）" }],
  },
] as const;

export type ReportCategory = (typeof REPORT_TAXONOMY)[number];
export type ReportCategoryId = ReportCategory["id"];
export type ReportSubcategoryId = ReportCategory["subcategories"][number]["id"];

export const REPORT_CATEGORY_IDS = REPORT_TAXONOMY.map((category) => category.id);
export const REPORT_SUBCATEGORY_IDS = REPORT_TAXONOMY.flatMap((category) =>
  category.subcategories.map((subcategory) => subcategory.id)
);

export function isValidReportSubcategory(
  categoryId: string,
  subcategoryId: string
): boolean {
  const category = REPORT_TAXONOMY.find((item) => item.id === categoryId);
  if (!category) {
    return false;
  }
  return category.subcategories.some((item) => item.id === subcategoryId);
}
