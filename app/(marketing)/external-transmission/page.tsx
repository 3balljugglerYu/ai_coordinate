import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

/**
 * 利用者情報の外部送信について(電気通信事業法第27条の12・外部送信規律)。
 *
 * 利用者の端末から外部の事業者へ送っている情報を、送り先ごとに知らせる。
 * ⚠️ 解析・計測のタグや SDK を足したり、送る情報を変えたりしたときは、ここも直すこと
 * (今の送り先: features/analytics/components/Ga4Script.tsx・VercelAnalyticsScripts.tsx)。
 * 日本語が正本。ほかの言語は要約の案内だけを出す(プライバシーポリシーと同じ)。
 */

/** 作った日。日本語と英語の両方で、この1つから出す。 */
const EXTERNAL_TRANSMISSION_ESTABLISHED_AT = { year: 2026, month: 10, day: 26 } as const;

type Row = { label: string; value: string; href?: string };
type Destination = { name: string; rows: Row[] };

const DESTINATIONS_JA: Destination[] = [
  {
    name: "1. Google アナリティクス",
    rows: [
      { label: "送り先", value: "Google LLC" },
      {
        label: "使い道",
        value:
          "当サービスの利用状況（見られているページ・来る前のページ・使われている端末など）を計測・分析し、サービスを改善するため",
      },
      {
        label: "送る情報",
        value:
          "閲覧したページの URL、来る前のページの URL、端末・OS・ブラウザの種類、言語、画面の大きさ、IP アドレス、Cookie などに保存した識別子、ログインしているかどうか。ログインしている利用者は、当サービスの中だけで使う識別子（ユーザー ID）",
      },
      {
        label: "送り先のプライバシーポリシー",
        value: "https://policies.google.com/privacy",
        href: "https://policies.google.com/privacy",
      },
      {
        label: "オプトアウト",
        value:
          "パソコンのブラウザでは、Google アナリティクス オプトアウト アドオンで止めることができます",
        href: "https://tools.google.com/dlpage/gaoptout",
      },
    ],
  },
  {
    name: "2. Vercel Analytics・Vercel Speed Insights",
    rows: [
      { label: "送り先", value: "Vercel Inc." },
      {
        label: "使い道",
        value: "ページの見られ方と表示の速さを計測し、サービスを改善するため",
      },
      {
        label: "送る情報",
        value:
          "閲覧したページの URL、来る前のページの URL、端末・OS・ブラウザの種類、国・地域、ページの表示にかかった時間、当サービスの中の操作（購入を始めた・生成が終わったなどの出来事と、その件数）",
      },
      {
        label: "送り先のプライバシーポリシー",
        value: "https://vercel.com/legal/privacy-policy",
        href: "https://vercel.com/legal/privacy-policy",
      },
      { label: "オプトアウト", value: "送り先が用意しているオプトアウトの方法はありません" },
    ],
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "利用者情報の外部送信について" : "External Transmission of User Information",
    description:
      locale === "ja"
        ? "Persta.AI が利用者の端末から外部の事業者へ送っている情報と、送り先・使い道のお知らせです。"
        : "Information that Persta.AI sends from users' devices to outside companies, with the recipients and purposes.",
    path: "/external-transmission",
    locale,
  });
}

function formatEstablishedAt(locale: string): string {
  const { year, month, day } = EXTERNAL_TRANSMISSION_ESTABLISHED_AT;
  if (locale === "ja") return `${year}年${month}月${day}日 制定`;
  const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return `Established: ${date}`;
}

export default async function ExternalTransmissionPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const isJa = locale === "ja";

  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold md:text-2xl">
          {isJa ? "利用者情報の外部送信について" : "External Transmission of User Information"}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {isJa
            ? "Persta.AI（以下「当サービス」）では、サービスの利用状況を把握して改善するため、利用者の端末から、次の外部の事業者へ、利用者に関する情報を送っています。電気通信事業法第27条の12（外部送信規律）にもとづき、送る情報の中身・送り先・送り先での使い道をお知らせします。"
            : "To understand and improve how the Service is used, Persta.AI sends information about users from their devices to the outside companies below (Google LLC for Google Analytics, and Vercel Inc. for Vercel Analytics and Speed Insights). The Japanese version of this page is the authoritative text and lists what is sent, to whom, and for what purpose."}
        </p>
      </div>

      {isJa ? (
        <div className="grid gap-6">
          {DESTINATIONS_JA.map((destination) => (
            <Card key={destination.name}>
              <CardHeader>
                <CardTitle>{destination.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-gray-100 text-sm">
                  {destination.rows.map((row) => (
                    <div key={row.label} className="py-2 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-3">
                      <dt className="font-medium text-gray-600">{row.label}</dt>
                      <dd className="mt-1 text-gray-800 sm:mt-0">
                        {row.href === row.value ? null : row.value}
                        {row.href ? (
                          <>
                            {row.href !== row.value ? "（" : null}
                            <a
                              href={row.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-primary underline underline-offset-2"
                            >
                              {row.href}
                            </a>
                            {row.href !== row.value ? "）" : null}
                          </>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-end text-xs text-gray-500">{formatEstablishedAt(locale)}</p>
    </main>
  );
}
