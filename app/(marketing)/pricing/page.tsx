import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { Tag, CreditCard, Timer, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PERCOIN_PACKAGES, GENERATION_PERCOIN_COST } from "@/features/credits/percoin-packages";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "料金" : "Pricing",
    description:
      locale === "ja"
        ? "Persta.AI の料金と支払い条件"
        : "Pricing and payment terms for Persta.AI",
    path: "/pricing",
    locale,
  });
}

export default async function PricingPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const packageCopy =
    locale === "ja"
      ? null
      : {
          "credit-110": {
            name: "110 Percoins",
            description:
              "Trial pack\nFor trying a few generations first\n\nEstimated generations\nNano Banana 2 0.5K: about 11\nNano Banana 2 1K: about 5\nPro 1K: about 2",
          },
          "credit-240": {
            name: "240 Percoins",
            description:
              "Light pack\nFor casual use\n\nEstimated generations\nNano Banana 2 0.5K: about 24\nNano Banana 2 1K: about 12\nPro 1K: about 4",
          },
          "credit-960": {
            name: "960 Percoins",
            description:
              "Basic pack\nFor deeper testing\n\nEstimated generations\nNano Banana 2 0.5K: about 96\nNano Banana 2 1K: about 48\nPro 1K: about 19",
          },
          "credit-1900": {
            name: "1,900 Percoins",
            description:
              "Value pack\nGreat balance of price and volume\n\nEstimated generations\nNano Banana 2 0.5K: about 190\nNano Banana 2 1K: about 95\nPro 1K: about 38",
          },
          "credit-4800": {
            name: "4,800 Percoins",
            description:
              "Best value pack\nLowest cost per coin\n\nEstimated generations\nNano Banana 2 0.5K: about 480\nNano Banana 2 1K: about 240\nPro 1K: about 96",
          },
        };
  const copy =
    locale === "ja"
      ? {
          title: "料金",
          description: "ペルコイン購入の価格とお支払い条件についてご案内します。",
          packagesTitle: "ペルコイン料金表（すべて税込）",
          packagesDescription: "購入画面でも税込価格を表示します。",
          creditsLabel: "ペルコイン",
          estimateLabel: "目安：コーディネート画面の既定生成1回あたり",
          estimateSuffix: "ペルコインを消費します。",
          paymentTitle: "支払い方法とタイミング",
          paymentDescription: "決済手段と課金のタイミングです。",
          paymentMethod: "支払方法",
          paymentMethodValue: "クレジットカード（Stripe）",
          paymentTiming: "支払時期",
          paymentTimingValue: "購入手続き完了時に即時決済されます。",
          additionalFees: "追加手数料",
          additionalFeesValue: "なし",
          availabilityTitle: "提供開始時期",
          availabilityDescription: "購入後の利用開始タイミングです。",
          availabilityBody:
            "決済完了後、即時にペルコインが付与され利用可能です。通信状況等により反映に時間がかかる場合があります。",
          refundTitle: "返金・キャンセル",
          refundDescription: "特商法ページと同じポリシーです。",
          refundItems: [
            "デジタル商品の性質上、正常品についての返金・キャンセル・交換はお受けしておりません。",
            "不具合・障害など弊社責による問題がある場合は、購入後7日以内にメールでご連絡ください。返金または再提供で対応いたします。",
          ],
          contactLabel: "連絡先",
        }
      : {
          title: "Pricing",
          description:
            "Pricing for Percoin purchases and the payment terms that apply to each order.",
          packagesTitle: "Percoin pricing (tax included)",
          packagesDescription: "Tax-inclusive pricing is also shown on the purchase screen.",
          creditsLabel: "Percoins",
          estimateLabel: "Estimate: one default coordinate generation uses",
          estimateSuffix: "Percoins.",
          paymentTitle: "Payment method and timing",
          paymentDescription: "Supported payment methods and when charges are applied.",
          paymentMethod: "Payment method",
          paymentMethodValue: "Credit card (Stripe)",
          paymentTiming: "Charge timing",
          paymentTimingValue: "Payment is processed immediately when the purchase is completed.",
          additionalFees: "Additional fees",
          additionalFeesValue: "None",
          availabilityTitle: "Service availability",
          availabilityDescription: "When purchased Percoins become available.",
          availabilityBody:
            "Percoins are granted immediately after payment is completed. It may take a short time to appear depending on network conditions.",
          refundTitle: "Refunds and cancellations",
          refundDescription: "This follows the same policy described on the commercial disclosure page.",
          refundItems: [
            "Because this is a digital product, refunds, cancellations, and exchanges are not available for properly delivered purchases.",
            "If there is a defect or service issue attributable to us, contact us by email within 7 days of purchase and we will respond with either a refund or a replacement.",
          ],
          contactLabel: "Contact",
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
              <Tag className="h-4 w-4 text-gray-500" />
              {copy.packagesTitle}
            </CardTitle>
            <CardDescription>{copy.packagesDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {PERCOIN_PACKAGES.map((pkg) => (
                <div key={pkg.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-gray-900">
                        {packageCopy?.[pkg.id as keyof typeof packageCopy]?.name ?? pkg.name}
                      </p>
                      <p className="whitespace-pre-line text-sm text-gray-600">
                        {packageCopy?.[pkg.id as keyof typeof packageCopy]?.description ?? pkg.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">¥{pkg.priceYen.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">
                        ({pkg.credits} {copy.creditsLabel})
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-600">
              {copy.estimateLabel} {GENERATION_PERCOIN_COST} {copy.estimateSuffix}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-500" />
              {copy.paymentTitle}
            </CardTitle>
            <CardDescription>{copy.paymentDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-gray-500">{copy.paymentMethod}</dt>
                <dd className="mt-1 text-gray-800">{copy.paymentMethodValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.paymentTiming}</dt>
                <dd className="mt-1 text-gray-800">{copy.paymentTimingValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.additionalFees}</dt>
                <dd className="mt-1 text-gray-800">{copy.additionalFeesValue}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-gray-500" />
              {copy.availabilityTitle}
            </CardTitle>
            <CardDescription>{copy.availabilityDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-800">
              {copy.availabilityBody}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gray-500" />
              {copy.refundTitle}
            </CardTitle>
            <CardDescription>{copy.refundDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
              {copy.refundItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>
                {copy.contactLabel}：
                <Link href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
                  yuh.products@gmail.com
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
