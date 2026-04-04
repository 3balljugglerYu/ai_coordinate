import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { CreditCard, ShieldCheck, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { BillingHub } from "@/features/subscription/components/BillingHub";
import { getUserSubscription } from "@/features/subscription/lib/server-api";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

interface PurchasePageProps {
  searchParams: Promise<{
    success?: string;
    canceled?: string;
    tab?: string;
  }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title:
      locale === "ja" ? "料金・コイン購入" : "Pricing and Credits",
    description:
      locale === "ja"
        ? "Persta.AI のサブスクリプションとコイン購入"
        : "Persta.AI subscriptions and credit purchases",
    path: "/credits/purchase",
    locale,
  });
}

export default async function PurchasePage({ searchParams }: PurchasePageProps) {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const params = await searchParams;
  const user = await getUser();
  const subscription = user ? await getUserSubscription(user.id) : null;
  const initialTab = params.tab === "subscription" ? "subscription" : "credits";
  const isSuccess = params.success === "true";
  const isCanceled = params.canceled === "true";

  const copy =
    locale === "ja"
      ? {
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
    <div className="min-h-screen bg-background">
      <div className="px-4 pb-12 pt-6 md:pt-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <BillingHub
            subscription={subscription}
            initialTab={initialTab}
            isSuccess={isSuccess}
            isCanceled={isCanceled}
          />

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
              <p className="text-sm text-gray-800">{copy.availabilityBody}</p>
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
              <ul className="list-inside list-disc space-y-2 text-sm text-gray-800">
                {copy.refundItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                <li>
                  {copy.contactLabel}：
                  <Link
                    href="mailto:yuh.products@gmail.com"
                    className="text-primary underline underline-offset-2"
                  >
                    yuh.products@gmail.com
                  </Link>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
