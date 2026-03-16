import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { Clock, FileText, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title:
      locale === "ja"
        ? "「商取引に関する開示」(特定商取引法に基づく表記)"
        : "Commercial Disclosure (Act on Specified Commercial Transactions)",
    description:
      locale === "ja"
        ? "Persta.AI の特商法表記ページ"
        : "Commercial disclosure page for Persta.AI under the Act on Specified Commercial Transactions",
    path: "/tokushoho",
    locale,
    ogTitle: locale === "ja" ? "商取引に関する開示" : "Commercial Disclosure",
  });
}

export default async function TokushohoPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  const copy =
    locale === "ja"
      ? {
          title: "商取引に関する開示（特定商取引法に基づく表記）",
          description: "「Persta.AI」に関する法定表示です。",
          basicInfoTitle: "基本情報",
          operatorLabel: "運営責任者",
          emailLabel: "メールアドレス",
          emailNote: "お問い合わせ対応：平日10:00-18:00、3営業日以内に回答",
          addressLabel: "所在地",
          addressValue: "請求があった場合には遅滞なく開示いたします。",
          phoneLabel: "電話番号",
          phoneValue:
            "請求があった場合には遅滞なく開示いたします。（お問い合わせはメールにてお願いいたします）",
          pricingTitle: "料金・お支払い・提供時期",
          pricingDescription: "価格表示・決済方法・提供開始タイミングについてのご案内です。",
          salesPrice: "販売価格",
          salesPriceValue: "税込価格を表示しています。",
          extraCost: "商品代金以外の必要料金",
          extraCostValue: "なし",
          feeLabel: "追加手数料",
          feeValue: "なし",
          paymentMethod: "支払方法",
          paymentMethodValue: "クレジットカード（Stripe）",
          paymentTiming: "支払時期",
          paymentTimingValue: "クレジットカードは商品・サービス購入時に即時決済されます。",
          deliveryTiming: "商品の提供時期",
          deliveryTimingValue:
            "決済完了後、即時利用可能です。なお、通信状況等により反映に時間がかかる場合があります。",
          refundTitle: "返品・キャンセル",
          refundDescription: "デジタル商品の特性上のポリシーです。",
          refundItems: [
            "デジタル商品の性質上、正常品については購入後の返金・キャンセル・交換はお受けしておりません。",
            "不具合・障害など弊社責による問題がある場合は、購入後7日以内にメールにてご連絡ください。内容を確認のうえ、返金または再提供で対応いたします。",
          ],
          contactLabel: "連絡先",
          serviceTitle: "サービス名",
          serviceDescription: "当サービスの名称です。",
        }
      : {
          title: "Commercial Disclosure (Act on Specified Commercial Transactions)",
          description: "Statutory commercial disclosure for Persta.AI.",
          basicInfoTitle: "Business information",
          operatorLabel: "Operator",
          emailLabel: "Email address",
          emailNote: "Support hours: Weekdays 10:00-18:00 JST, reply within 3 business days",
          addressLabel: "Business address",
          addressValue: "Disclosed without delay upon request.",
          phoneLabel: "Phone number",
          phoneValue: "Disclosed without delay upon request. Please contact us by email.",
          pricingTitle: "Pricing, payment, and service timing",
          pricingDescription:
            "Information about pricing, payment methods, and when service becomes available.",
          salesPrice: "Sales price",
          salesPriceValue: "Prices are displayed inclusive of tax.",
          extraCost: "Additional required charges",
          extraCostValue: "None",
          feeLabel: "Extra fees",
          feeValue: "None",
          paymentMethod: "Payment method",
          paymentMethodValue: "Credit card (Stripe)",
          paymentTiming: "Payment timing",
          paymentTimingValue: "Credit cards are charged immediately when a purchase is completed.",
          deliveryTiming: "Service availability",
          deliveryTimingValue:
            "The service becomes available immediately after payment. Depending on network conditions, reflected changes may take a short time.",
          refundTitle: "Returns and cancellations",
          refundDescription: "Policy for digital products.",
          refundItems: [
            "Because this is a digital product, refunds, cancellations, and exchanges are not available after purchase when the product has been delivered as intended.",
            "If there is a defect or service issue attributable to us, please contact us by email within 7 days of purchase. After reviewing the case, we will respond with either a refund or re-provision.",
          ],
          contactLabel: "Contact",
          serviceTitle: "Service name",
          serviceDescription: "The name of this service.",
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
              <FileText className="h-4 w-4 text-gray-500" />
              {copy.basicInfoTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-gray-500">{copy.operatorLabel}</dt>
                <dd className="mt-1 text-gray-800">土井秀悠</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-gray-500">{copy.emailLabel}</dt>
                <dd className="mt-1">
                  <Link href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
                    yuh.products@gmail.com
                  </Link>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {copy.emailNote}
                  </p>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.addressLabel}</dt>
                <dd className="mt-1 text-gray-800">{copy.addressValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.phoneLabel}</dt>
                <dd className="mt-1 text-gray-800">{copy.phoneValue}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldQuestion className="h-4 w-4 text-gray-500" />
              {copy.pricingTitle}
            </CardTitle>
            <CardDescription>{copy.pricingDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-gray-500">{copy.salesPrice}</dt>
                <dd className="mt-1 text-gray-800">{copy.salesPriceValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.extraCost}</dt>
                <dd className="mt-1 text-gray-800">{copy.extraCostValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.feeLabel}</dt>
                <dd className="mt-1 text-gray-800">{copy.feeValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.paymentMethod}</dt>
                <dd className="mt-1 text-gray-800">{copy.paymentMethodValue}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{copy.paymentTiming}</dt>
                <dd className="mt-1 text-gray-800">{copy.paymentTimingValue}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-gray-500">{copy.deliveryTiming}</dt>
                <dd className="mt-1 text-gray-800">{copy.deliveryTimingValue}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{copy.refundTitle}</CardTitle>
            <CardDescription>{copy.refundDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-gray-800">
              {copy.refundItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
              <p className="text-xs text-gray-600">
                {copy.contactLabel}:{" "}
                <Link href="mailto:yuh.products@gmail.com" className="underline underline-offset-2">
                  yuh.products@gmail.com
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{copy.serviceTitle}</CardTitle>
            <CardDescription>{copy.serviceDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-800">Persta.AI</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
