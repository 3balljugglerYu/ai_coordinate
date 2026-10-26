import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { formatLegalDate } from "@/features/legal/lib/legal-text";

/**
 * 利用者情報の外部送信について(電気通信事業法第27条の12・外部送信規律)。
 *
 * 利用者の端末から外部の事業者へ送っている情報を、送り先ごとに知らせる。
 * ⚠️ 外部のスクリプト・タグ・SDK を足したり、送る情報を変えたりしたときは、ここも直すこと。
 * 2026-10-26 時点の送り先:
 *  - Google アナリティクス: features/analytics/components/Ga4Script.tsx(+ features/analytics/lib/track-event.ts の trackEvent)
 *  - Vercel Analytics・Speed Insights: features/analytics/components/VercelAnalyticsScripts.tsx(+ @vercel/analytics の track)
 *  - Cloudflare Turnstile: features/catalog/components/CatalogSubmissionForm.tsx(作品の申請のフォーム)
 *  - X の広告の Pixel: features/analytics/components/XPixelScript.tsx(設定は features/analytics/lib/ad-pixels.ts)
 *  - Meta の広告の Pixel: features/analytics/components/MetaPixelScript.tsx(設定は同じ ad-pixels.ts)
 * 日本語が正本。ほかの言語は、送り先の一覧と日本語のページへの案内を出す(プライバシーポリシーと同じ)。
 */

const EXTERNAL_TRANSMISSION_ESTABLISHED_AT = { year: 2026, month: 10, day: 26 } as const;
/** 最後に改定した日(送り先を足したり、送る情報を変えたりしたら、本番に出す日にする)。2026-10-27: Meta Pixel を足した */
const EXTERNAL_TRANSMISSION_REVISED_AT = { year: 2026, month: 10, day: 27 } as const;

type Row =
  | { label: string; text: string }
  | { label: string; text?: string; link: string };

type Destination = { name: string; rows: Row[] };

const DESTINATIONS_JA: Destination[] = [
  {
    name: "1. Google アナリティクス",
    rows: [
      { label: "送り先", text: "Google LLC" },
      {
        label: "使い道",
        text: "当サービスの利用状況（見られているページ・来る前のページ・使われている端末など）を計測・分析し、サービスを改善するため",
      },
      {
        label: "送る情報",
        text: "閲覧したページの URL、来る前のページの URL、端末・OS・ブラウザの種類、言語、画面の大きさ、IP アドレス、Cookie などに保存した識別子、ログインしているかどうか、当サービスの中の操作（ホームのバナーを押した・企画のページのボタンを押した・画像の分割を使ったなどの出来事と、押したバナーの行き先などの中身）。ログインしている利用者は、当サービスの中だけで使う識別子（ユーザー ID）",
      },
      { label: "送り先のプライバシーポリシー", link: "https://policies.google.com/privacy" },
      {
        label: "オプトアウト",
        text: "パソコンのブラウザでは、Google アナリティクス オプトアウト アドオンで止めることができます",
        link: "https://tools.google.com/dlpage/gaoptout",
      },
    ],
  },
  {
    name: "2. Vercel Analytics・Vercel Speed Insights",
    rows: [
      { label: "送り先", text: "Vercel Inc." },
      { label: "使い道", text: "ページの見られ方と表示の速さを計測し、サービスを改善するため" },
      {
        label: "送る情報",
        text: "閲覧したページの URL、来る前のページの URL、端末・OS・ブラウザの種類、IP アドレス（国・地域の判定に使われます）、ページの表示にかかった時間、当サービスの中の操作（購入を始めた・生成が終わったなどの出来事と、選んだ商品・件数・失敗したときのエラーの文（100文字まで））",
      },
      { label: "送り先のプライバシーポリシー", link: "https://vercel.com/legal/privacy-policy" },
      { label: "オプトアウト", text: "送り先が用意しているオプトアウトの方法はありません" },
    ],
  },
  {
    name: "3. Cloudflare Turnstile（作品の申請のフォームだけ）",
    rows: [
      { label: "送り先", text: "Cloudflare, Inc." },
      { label: "使い道", text: "作品の申請のフォームで、機械による不正な送信を防ぐため" },
      {
        label: "送る情報",
        text: "IP アドレス、端末・OS・ブラウザの種類と設定、画面での操作の様子など、人による操作かどうかの判定に使う情報",
      },
      { label: "送り先のプライバシーポリシー", link: "https://www.cloudflare.com/privacypolicy/" },
      {
        label: "オプトアウト",
        text: "申請の送信に必要なため、止めることはできません（作品の申請のフォームを開いたときだけ送ります）",
      },
    ],
  },
  {
    name: "4. X の広告の計測タグ（X Pixel）",
    rows: [
      { label: "送り先", text: "X Corp." },
      {
        label: "使い道",
        text: "X に出した当サービスの広告の効果（広告を見た人・押した人が、当サービスを訪れたか）を測り、広告の配信を調整するため。X は、この情報を、X での広告の表示に使うことがあります",
      },
      {
        label: "送る情報",
        text: "開いたページの URL（当サービスの最初のページ・企画・カタログ・スタイル・使い方・料金などのページだけで、ドメインとページの場所だけを送ります。「?」「#」のうしろは送りません。投稿・作品・プロフィール・共有・ログイン・検索などのページでは、URL を送りません）、端末・OS・ブラウザの種類と端末の機種名、言語、タイムゾーン、画面の大きさ・色の深さ・画素の細かさ、CPU のコアの数、タッチ操作に対応しているか、ブラウザのトラッキング拒否（Do Not Track）の設定、電池の残量と充電中かどうか、IP アドレス、Cookie などに保存した識別子、X の広告から来たことを示す値、ページを開いた日時。ページを読み込んだときに1回だけ送ります（当サービスの中でほかのページへ移ったときは送りません）。当サービスへの登録が終わったときは、登録が終わったという出来事も1回送ります（だれが登録したか・メールアドレスなどは送りません）。管理画面から開いたときは読み込みません。来る前のページの URL、押したボタンの文字、フォームに入力した内容（メールアドレス・電話番号・名前など）、ページにいた時間は送りません",
      },
      { label: "送り先のプライバシーポリシー", link: "https://x.com/ja/privacy" },
      {
        label: "オプトアウト",
        text: "X の設定の「広告の環境設定」で、パーソナライズド広告をオフにできます（X にログインした状態で行います）。方法は X のヘルプをご覧ください",
        link: "https://help.x.com/ja/safety-and-security/privacy-controls-for-tailored-ads",
      },
    ],
  },
  {
    name: "5. Meta の広告の計測タグ（Meta Pixel）",
    rows: [
      { label: "送り先", text: "Meta Platforms, Inc.（Facebook・Instagram を運営する事業者）" },
      {
        label: "使い道",
        text: "Facebook・Instagram に出した当サービスの広告の効果（広告を見た人・押した人が、当サービスを訪れたか・登録したか）を測り、広告の配信を調整するため。Meta は、この情報を、Facebook・Instagram での広告の表示に使うことがあります",
      },
      {
        label: "送る情報",
        text: "開いたページの URL（「?」「#」のうしろも含みます。検索の語句などが入ることがあります）、来る前のページの URL、端末・OS・ブラウザの種類、言語、画面の大きさ、IP アドレス、Cookie などに保存した識別子、Meta の広告から来たことを示す値、ページを開いた日時。当サービスの中でほかのページへ移ったときも、そのたびに、ページを開いたことを送ります。当サービスへの登録が終わったときは、登録が終わったという出来事も1回送ります（だれが登録したか・メールアドレスなどは送りません）。管理画面・ログインと登録の画面・パスワードの再設定・検索・マイページ・お知らせ・投稿の下書き・共有リンクのページでは、Meta Pixel を動かしません（ただし、ほかのページで送る準備をしている間にこれらのページへ移ったときは、移った先のページの URL が送られることがあります）。押したボタンの文字や、フォームに入力した内容（メールアドレス・電話番号・名前など）は送りません",
      },
      { label: "送り先のプライバシーポリシー", link: "https://www.facebook.com/privacy/policy/" },
      {
        label: "オプトアウト",
        text: "Meta のアカウントセンターの「Meta テクノロジー外のアクティビティ」で、当サービスなどから送られた情報とアカウントの結び付けを解除し、今後の結び付けを止めることができます（Facebook または Instagram にログインした状態で行います）",
        link: "https://accountscenter.facebook.com/info_and_permissions/off_facebook_activity",
      },
    ],
  },
];

const DESTINATIONS_EN = [
  "Google Analytics (Google LLC): usage measurement and analysis. When you are logged in, an identifier used only within the Service (user ID) is also sent.",
  "Vercel Analytics and Vercel Speed Insights (Vercel Inc.): measurement of page views and page speed.",
  "Cloudflare Turnstile (Cloudflare, Inc.): prevention of automated submissions, on the work submission form only.",
  "X Pixel (X Corp.): measuring the effectiveness of the Service's ads on X (page visits and completed sign-ups, without who signed up) and adjusting ad delivery. X may use this information to show ads on X.",
  "Meta Pixel (Meta Platforms, Inc.): measuring the effectiveness of the Service's ads on Facebook and Instagram (page visits and completed sign-ups, without who signed up) and adjusting ad delivery. Meta may use this information to show ads on Facebook and Instagram.",
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

function RowValue({ row }: { row: Row }) {
  if (!("link" in row)) return <>{row.text}</>;
  const anchor = (
    <a
      href={row.link}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-primary underline underline-offset-2"
    >
      {row.link}
    </a>
  );
  return row.text ? (
    <>
      {row.text}（{anchor}）
    </>
  ) : (
    anchor
  );
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
            ? "Persta.AI（以下「当サービス」）では、サービスの利用状況を把握して改善するため、また、当サービスの広告の効果を測るため、利用者の端末から、次の外部の事業者へ、利用者に関する情報を送っています。電気通信事業法第27条の12（外部送信規律）にもとづき、送る情報の中身・送り先・送り先での使い道をお知らせします。"
            : "To understand and improve how the Service is used, and to measure the effectiveness of its ads, Persta.AI sends information about users from their devices to the outside companies below. The Japanese version of this page is the authoritative text and lists in detail what is sent, to whom, and for what purpose."}
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
                        <RowValue row={row} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm text-gray-800">
            <ul className="list-disc space-y-2 ps-5">
              {DESTINATIONS_EN.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              For the full details (what is sent, purposes, privacy policies and opt-out), please see the{" "}
              <a
                href={localizePublicPath("/external-transmission", "ja")}
                className="text-primary underline underline-offset-2"
              >
                Japanese version of this page
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-end text-xs text-gray-500">
        {formatLegalDate(EXTERNAL_TRANSMISSION_ESTABLISHED_AT, locale, "established")}
        <br />
        {formatLegalDate(EXTERNAL_TRANSMISSION_REVISED_AT, locale, "revised")}
      </p>
    </main>
  );
}
