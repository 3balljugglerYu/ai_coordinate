import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { AlertCircle, CreditCard, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title:
      locale === "ja"
        ? "資金決済法に基づく表示"
        : "Display Under the Payment Services Act",
    description:
      locale === "ja"
        ? "Persta.AI の資金決済法に基づく表示"
        : "Required disclosure for Persta.AI under Japan's Payment Services Act",
    path: "/payment-services-act",
    locale,
  });
}

export default async function PaymentServicesActPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  const copy =
    locale === "ja"
      ? {
          title: "資金決済法に基づく表示",
          description: "「Persta.AI」に関する資金決済法に基づく表示です。",
          issuerTitle: "前払式支払手段の発行者",
          issuerDescription: "前払式支払手段の発行者に関する情報",
          issuerName: "発行者名",
          issuerNameValue:
            "請求があった場合には遅滞なく開示いたします。（お問い合わせはメールにてお願いいたします）",
          addressLabel: "所在地",
          addressValue:
            "請求があった場合には遅滞なく開示いたします。（お問い合わせはメールにてお願いいたします）",
          contactLabel: "連絡先",
          typeTitle: "前払式支払手段の種類",
          typeDescription: "発行する前払式支払手段の種類について",
          typeParagraphs: [
            "当サービスでは、ペルコイン購入により取得できる「ペルコイン」を前払式支払手段として発行しています。",
            "ペルコインは、当サービス内でのみ使用可能なデジタル通貨であり、画像生成サービスの利用料金の支払いに使用できます。",
          ],
          periodTitle: "前払式支払手段の利用可能期間",
          periodDescription: "ペルコインの有効期限について",
          periodParagraphs: [
            "購入により取得したペルコイン（前払式支払手段）には、有効期限は設定しておりません。ただし、当サービスの終了、または法令に基づく場合を除き、無期限に使用可能です。",
            "なお、新規登録・チュートリアル完了・紹介特典等により無料で付与されるペルコインには有効期限があり、付与月の翌月から起算して6ヶ月後の月末（日本時間）で失効します。詳細は",
          ],
          refundTitle: "未使用残高の返金",
          refundDescription: "未使用残高の返金について",
          refundLead:
            "ペルコインの未使用残高について、原則として返金は行っておりません。ただし、以下の場合には返金に対応する場合があります。",
          refundItems: [
            "当サービスの不具合により、ペルコインが正常に使用できない場合",
            "当サービスの終了により、ペルコインが使用できなくなった場合",
            "その他、当サービスが返金を認めた場合",
          ],
          refundContact: "返金を希望される場合は、メールにてお問い合わせください。",
          depositTitle: "資金決済法に基づく供託",
          depositDescription: "供託について",
          depositBody:
            "当サービスは、資金決済法に基づき、前払式支払手段の発行に伴い、未使用残高の一定割合を供託しています。供託の詳細については、請求があった場合には遅滞なく開示いたします。",
          complaintTitle: "苦情・相談窓口",
          complaintDescription: "苦情・相談について",
          complaintBody:
            "前払式支払手段に関する苦情・相談については、以下の連絡先までお問い合わせください。",
        }
      : {
          title: "Display Under the Payment Services Act",
          description:
            "Required disclosure for Persta.AI under Japan's Payment Services Act.",
          issuerTitle: "Issuer of prepaid payment instruments",
          issuerDescription: "Information about the issuer",
          issuerName: "Issuer name",
          issuerNameValue: "Disclosed without delay upon request. Please contact us by email.",
          addressLabel: "Address",
          addressValue: "Disclosed without delay upon request. Please contact us by email.",
          contactLabel: "Contact",
          typeTitle: "Type of prepaid payment instrument",
          typeDescription: "The type of instrument issued by the Service",
          typeParagraphs: [
            'The Service issues "Percoins", which can be obtained by purchasing Percoins, as a prepaid payment instrument.',
            "Percoins are a digital currency that can only be used within the Service and may be used to pay fees for the image generation service.",
          ],
          periodTitle: "Period of use",
          periodDescription: "Expiration of Percoins",
          periodParagraphs: [
            "Percoins obtained through purchase, which qualify as prepaid payment instruments, do not have an expiration date and may be used indefinitely unless the Service ends or the law requires otherwise.",
            "Percoins granted free of charge through new registration, tutorial completion, referral benefits, and similar programs do have an expiration date and expire at the end of the month that is six months after the month following the month of grant (Japan time). See the",
          ],
          refundTitle: "Refunds of unused balances",
          refundDescription: "Refund policy for unused balances",
          refundLead:
            "Unused Percoin balances are generally non-refundable. However, refunds may be considered in the following cases.",
          refundItems: [
            "If a defect in the Service prevents Percoins from being used properly",
            "If the Service ends and Percoins can no longer be used",
            "Any other case in which the Service expressly approves a refund",
          ],
          refundContact: "If you would like to request a refund, please contact us by email.",
          depositTitle: "Security deposit under the Payment Services Act",
          depositDescription: "Information about deposits",
          depositBody:
            "In accordance with the Payment Services Act, the Service deposits a certain percentage of unused balances when issuing prepaid payment instruments. Details will be disclosed without delay upon request.",
          complaintTitle: "Complaints and inquiries",
          complaintDescription: "Where to contact us",
          complaintBody:
            "If you have complaints or inquiries regarding prepaid payment instruments, please contact us using the address below.",
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
              <CreditCard className="h-4 w-4 text-gray-500" />
              {copy.issuerTitle}
            </CardTitle>
            <CardDescription>{copy.issuerDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div className="md:col-span-2">
                <dt className="text-gray-500">{copy.issuerName}</dt>
                <dd className="mt-1 text-gray-800">{copy.issuerNameValue}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-gray-500">{copy.addressLabel}</dt>
                <dd className="mt-1 text-gray-800">{copy.addressValue}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-gray-500">{copy.contactLabel}</dt>
                <dd className="mt-1">
                  <a href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
                    yuh.products@gmail.com
                  </a>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-gray-500" />
              {copy.typeTitle}
            </CardTitle>
            <CardDescription>{copy.typeDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {copy.typeParagraphs.map((paragraph) => (
              <p key={paragraph} className="mt-2 first:mt-0 text-sm text-gray-800">
                {paragraph}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-gray-500" />
              {copy.periodTitle}
            </CardTitle>
            <CardDescription>{copy.periodDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-gray-800">{copy.periodParagraphs[0]}</p>
            <p className="text-sm text-gray-800">
              {copy.periodParagraphs[1]}
              {locale === "ja" ? null : " "}
              <Link
                href={localizePublicPath("/terms", locale)}
                className="text-primary underline underline-offset-2"
              >
                {locale === "ja" ? "利用規約" : "Terms of Service"}
              </Link>
              {locale === "ja" ? "。" : "."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{copy.refundTitle}</CardTitle>
            <CardDescription>{copy.refundDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-800">{copy.refundLead}</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-gray-800">
              {copy.refundItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-gray-800">{copy.refundContact}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{copy.depositTitle}</CardTitle>
            <CardDescription>{copy.depositDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-800">{copy.depositBody}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{copy.complaintTitle}</CardTitle>
            <CardDescription>{copy.complaintDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-800">{copy.complaintBody}</p>
            <p className="mt-2 text-sm text-gray-800">
              <a href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
                yuh.products@gmail.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
