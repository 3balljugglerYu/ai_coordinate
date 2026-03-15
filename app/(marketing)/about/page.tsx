import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "サービス紹介" : "About",
    description:
      locale === "ja"
        ? "Persta.AI のサービス概要と提供内容"
        : "Overview of Persta.AI and what the service offers",
    path: "/about",
    locale,
  });
}

export default async function AboutPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy =
    locale === "ja"
      ? {
          title: "サービス紹介",
          description: "Persta.AI の提供内容とご利用条件についてご案内します。",
          cardTitle: "サービス概要",
          cardDescription:
            "Persta.AIは、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。",
          items: [
            "ユーザーが生成したコーディネート画像を投稿し、コミュニティで共有・閲覧できます。",
            "生成用のペルコインを購入すると、コーディネート生成を追加で利用できます。",
            "基本機能はWebブラウザから利用でき、追加のソフトウェアインストールは不要です。",
          ],
        }
      : {
          title: "About",
          description:
            "An overview of Persta.AI, including what the service provides and how it can be used.",
          cardTitle: "Service overview",
          cardDescription:
            "Persta.AI is a platform for styling fashion, characters, and visual ideas with AI.",
          items: [
            "Users can publish generated outfit images and share them with the community.",
            "Purchasing Percoins unlocks additional image generation capacity.",
            "The core experience runs in the browser, so no additional software installation is required.",
          ],
        };

  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold md:text-2xl">{copy.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{copy.description}</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-gray-500" />
              {copy.cardTitle}
            </CardTitle>
            <CardDescription>{copy.cardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
              {copy.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
