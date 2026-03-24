"use client";

import { useTranslations } from "next-intl";

/**
 * ホームページのタイトル・サブタイトル。
 * クライアントコンポーネントとして useTranslations で正しいロケールのテキストを表示する。
 */
export function HomeHeading() {
  const t = useTranslations("home");

  return (
    <div className="mb-4">
      <h1 className="text-3xl font-bold">{t("heading")}</h1>
      <p className="mt-2 text-muted-foreground">
        {t("subtitle")}
      </p>
    </div>
  );
}
