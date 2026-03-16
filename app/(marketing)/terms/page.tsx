import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { AlertCircle, Coins, FileText, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

type Section = {
  title: string;
  description: string;
  icon?: "file" | "shield" | "alert" | "coins";
  paragraphs?: string[];
  list?: string[];
};

const icons = {
  file: FileText,
  shield: Shield,
  alert: AlertCircle,
  coins: Coins,
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "利用規約" : "Terms of Service",
    description:
      locale === "ja"
        ? "Persta.AI の利用規約"
        : "Terms of Service for using Persta.AI",
    path: "/terms",
    locale,
  });
}

export default async function TermsPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  const copy =
    locale === "ja"
      ? {
          title: "利用規約",
          description: "「Persta.AI」の利用規約です。",
          sections: [
            {
              icon: "file",
              title: "第1条（適用）",
              description: "本規約の適用範囲について",
              paragraphs: [
                "本規約は、Persta.AI（以下「当サービス」）の利用条件を定めるものです。登録ユーザーの皆さま（以下「ユーザー」）には、本規約に従って、当サービスをご利用いただきます。",
              ],
            },
            {
              icon: "shield",
              title: "第2条（利用登録）",
              description: "アカウント登録について",
              paragraphs: [
                "当サービスの利用を希望する方は、本規約に同意の上、当サービスの定める方法によって利用登録を申請し、当サービスがこれを承認することによって、利用登録が完了するものとします。",
              ],
            },
            {
              icon: "alert",
              title: "第3条（禁止事項）",
              description: "利用にあたっての禁止事項",
              list: [
                "法令または公序良俗に違反する行為",
                "犯罪行為に関連する行為",
                "当サービスの内容等、当サービスに含まれる著作権、商標権ほか知的財産権を侵害する行為",
                "当サービス、ほかのユーザー、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為",
                "当サービスによって得られた情報を商業的に利用する行為",
                "当サービスの運営を妨害するおそれのある行為",
                "不正アクセスをし、またはこれを試みる行為",
                "他のユーザーに対する嫌がらせ、誹謗中傷、差別的表現等の投稿、または権利侵害・法令違反のおそれのあるコンテンツの投稿",
                "通報制度の濫用（虚偽の通報、嫌がらせ目的の通報等）",
                "その他、当サービスが不適切と判断する行為",
              ],
            },
            {
              title: "第4条（当サービスの提供の停止等）",
              description: "サービス提供の停止について",
              paragraphs: [
                "当サービスは、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく当サービスの全部または一部の提供を停止または中断することができるものとします。",
              ],
              list: [
                "当サービスにかかるコンピュータシステムの保守点検または更新を行う場合",
                "地震、落雷、火災、停電または天災などの不可抗力により、当サービスの提供が困難となった場合",
                "コンピュータまたは通信回線等が事故により停止した場合",
                "その他、当サービスが当サービスの提供が困難と判断した場合",
              ],
            },
            {
              title: "第5条（保証の否認および免責）",
              description: "免責事項について",
              paragraphs: [
                "当サービスは、当サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。",
              ],
            },
            {
              title: "第6条（サービス内容の変更等）",
              description: "サービス内容の変更について",
              paragraphs: [
                "当サービスは、ユーザーへの事前の告知をもって、本サービスの内容を変更、追加または廃止することがあり、ユーザーはこれに同意するものとします。",
              ],
            },
            {
              icon: "coins",
              title: "第6条の2（ペルコイン）",
              description: "ペルコインの取得と有効期限について",
              paragraphs: [
                "当サービスでは、ペルコインを購入により取得するほか、新規登録・チュートリアル完了・紹介特典・デイリー投稿・連続ログインなどの特典として無料で付与することがあります。",
                "購入により取得したペルコインには有効期限は設定しておりません。",
                "無料で付与したペルコインには有効期限があり、付与した月の翌月から起算して6ヶ月後の月末（日本時間）をもって失効します。失効した無料ペルコインの返還・再発行は行いません。",
                "画像生成時に消費されるペルコインは、有効期限のある無料付与分（以下「期間限定ペルコイン」）から優先して充当されます。生成が失敗した場合は、当該生成で消費したペルコインを、消費時点の種別および有効期限を保持した状態で返還します。",
                "ペルコインの残高・有効期限等は、当サービス所定の画面でご確認いただけます。",
              ],
            },
            {
              title: "第7条（利用規約の変更）",
              description: "規約変更について",
              paragraphs: [
                "当サービスは、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができるものとします。なお、本規約の変更後、本サービスの利用を開始した場合には、当該ユーザーは変更後の規約に同意したものとみなします。",
              ],
            },
            {
              title: "第8条（個人情報の取扱い）",
              description: "個人情報の取り扱いについて",
              paragraphs: [
                "当サービスは、本サービスの利用によって取得する個人情報については、当サービス「プライバシーポリシー」に従い適切に取り扱うものとします。",
              ],
            },
            {
              title: "第9条（退会およびアカウント削除）",
              description: "退会手続きと削除の効力について",
              paragraphs: [
                "ユーザーは当サービス所定の方法により退会手続きを行うことができます。退会手続き後、当サービスは退会申請日から30日間の経過後に当該アカウントを完全削除します。",
                "退会申請時点で、当該ユーザーが投稿中の画像は投稿取り消し（非公開）となります。",
                "完全削除時には、当サービス内で当該ユーザーに紐づくデータ（プロフィール情報、生成画像、投稿画像、コメント、いいね、保有ペルコイン残高等）を削除し、削除後は復元できません。退会により失効したペルコイン残高の返還・再発行は行いません。",
                "アカウント完全削除後は、同一メールアドレスで再度登録できますが、再登録は新規登録として扱われ、削除前のデータ・権利・残高は引き継がれません。",
              ],
            },
            {
              title: "第9条の2（通報・ブロック及びコンテンツのモデレーション）",
              description: "通報・ブロック機能と審査について",
              paragraphs: [
                "当サービスは、不適切なコンテンツの排除およびユーザー間のトラブル防止のため、通報・ブロック・コンテンツ審査の機能を提供しています。",
              ],
              list: [
                "通報：ユーザーは、他のユーザーの投稿が利用規約や法令に反する等と判断した場合、所定の方法で通報することができます。通報された投稿は、一定のしきい値に達した時点で審査待ちとなり、審査が完了するまで当サービス上で全ユーザーに非表示となる場合があります。",
                "ブロック：ユーザーは、他のユーザーをブロックすることができます。ブロックしたユーザーの投稿は、当該ユーザーの画面に表示されません。ブロック関係は、アカウント画面から解除できます。",
                "審査：当サービスは、通報に基づき審査を行い、審査の結果に応じて当該投稿の非公開・削除等の措置を講じることがあります。審査の記録は、運営上の必要に応じて保持します。",
                "通報・ブロックの濫用（虚偽通報、嫌がらせ目的の利用等）は禁止事項とし、当サービスが不適切と判断した場合には利用制限等の対応を行うことがあります。",
              ],
            },
            {
              title: "第10条（準拠法・裁判管轄）",
              description: "準拠法と裁判管轄について",
              paragraphs: [
                "本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当サービスの本店所在地を管轄する裁判所を専属的合意管轄とします。",
              ],
            },
          ] satisfies Section[],
        }
      : {
          title: "Terms of Service",
          description: "These are the Terms of Service for Persta.AI.",
          sections: [
            {
              icon: "file",
              title: "Article 1 (Application)",
              description: "Scope of these Terms",
              paragraphs: [
                "These Terms set forth the conditions for using Persta.AI (the “Service”). Registered users (the “Users”) shall use the Service in accordance with these Terms.",
              ],
            },
            {
              icon: "shield",
              title: "Article 2 (Registration)",
              description: "Account registration",
              paragraphs: [
                "Any person who wishes to use the Service shall apply for registration in the manner prescribed by the Service after agreeing to these Terms, and registration shall be completed when the Service approves that application.",
              ],
            },
            {
              icon: "alert",
              title: "Article 3 (Prohibited Acts)",
              description: "Actions prohibited when using the Service",
              list: [
                "Acts that violate laws, regulations, or public order and morals",
                "Acts related to criminal activity",
                "Acts that infringe copyrights, trademarks, or other intellectual property rights included in the Service",
                "Acts that destroy or interfere with the functions of the Service, other users, or any third party's servers or networks",
                "Acts that commercially exploit information obtained through the Service",
                "Acts that may interfere with the operation of the Service",
                "Unauthorized access or attempts to gain unauthorized access",
                "Posting harassment, defamation, discriminatory expressions, or content that may infringe rights or violate laws with respect to other users",
                "Abuse of the reporting system, including false reports or reports made for harassment",
                "Any other acts that the Service considers inappropriate",
              ],
            },
            {
              title: "Article 4 (Suspension of the Service)",
              description: "Suspension of service delivery",
              paragraphs: [
                "The Service may suspend or interrupt all or part of the Service without prior notice to Users if it determines that any of the following circumstances apply.",
              ],
              list: [
                "When the computer system related to the Service is inspected, maintained, or updated",
                "When provision of the Service becomes difficult due to force majeure such as earthquakes, lightning, fire, power outages, or natural disasters",
                "When computers or communication lines stop due to accidents",
                "Any other case in which the Service determines that provision of the Service is difficult",
              ],
            },
            {
              title: "Article 5 (Disclaimer of Warranties and Limitation of Liability)",
              description: "Disclaimer",
              paragraphs: [
                "The Service does not expressly or impliedly warrant that the Service is free from defects in fact or law, including defects related to safety, reliability, accuracy, completeness, validity, fitness for a particular purpose, security, errors, bugs, or infringement of rights.",
              ],
            },
            {
              title: "Article 6 (Changes to the Service)",
              description: "Changes to service content",
              paragraphs: [
                "The Service may change, add, or discontinue the content of the Service after prior notice to Users, and Users agree to this.",
              ],
            },
            {
              icon: "coins",
              title: "Article 6-2 (Percoins)",
              description: "Acquisition and expiration of Percoins",
              paragraphs: [
                "Percoins may be obtained by purchase, and may also be granted free of charge as rewards for actions such as new registration, tutorial completion, referral benefits, daily posts, and consecutive logins.",
                "Percoins obtained through purchase do not have an expiration date.",
                "Percoins granted free of charge have an expiration date and expire at the end of the month that is six months after the month following the month of grant (Japan time). Expired free Percoins will not be refunded or reissued.",
                "When generating images, free grants with an expiration date (“limited-term Percoins”) are consumed first. If generation fails, the Percoins consumed for that generation are returned while preserving their type and expiration date at the time of consumption.",
                "You can check your Percoin balance and expiration dates on the screens designated by the Service.",
              ],
            },
            {
              title: "Article 7 (Changes to these Terms)",
              description: "Changes to the Terms",
              paragraphs: [
                "If deemed necessary, the Service may change these Terms at any time without notifying Users. If a User starts using the Service after such changes, that User is deemed to have agreed to the revised Terms.",
              ],
            },
            {
              title: "Article 8 (Handling of Personal Information)",
              description: "Handling of personal information",
              paragraphs: [
                "The Service shall appropriately handle personal information obtained through use of the Service in accordance with the Service's Privacy Policy.",
              ],
            },
            {
              title: "Article 9 (Withdrawal and Account Deletion)",
              description: "Withdrawal procedure and effect of deletion",
              paragraphs: [
                "Users may complete a withdrawal procedure using the method prescribed by the Service. After a withdrawal request, the Service will permanently delete the account 30 days after the date of the request.",
                "At the time a withdrawal request is submitted, any images currently posted by that User will be withdrawn from posting and made private.",
                "Upon permanent deletion, data linked to that User within the Service, including profile information, generated images, posted images, comments, likes, and Percoin balances, will be deleted and cannot be restored. Percoin balances lost through withdrawal will not be refunded or reissued.",
                "After permanent deletion, the same email address may be used to register again. However, re-registration will be treated as a new registration, and no data, rights, or balances from before deletion will be carried over.",
              ],
            },
            {
              title: "Article 9-2 (Reports, Blocks, and Content Moderation)",
              description: "Reporting, blocking, and review processes",
              paragraphs: [
                "The Service provides reporting, blocking, and content review functions in order to remove inappropriate content and prevent trouble between users.",
              ],
              list: [
                "Reports: A user may report another user's post through the designated method if they believe it violates these Terms or applicable laws. A reported post may move into review after it reaches a certain threshold and may be hidden from all users until the review is completed.",
                "Blocks: A user may block another user. Posts from a blocked user will not be shown on that user's screen. Block relationships can be removed from the account screen.",
                "Review: Based on reports, the Service may conduct a review and take measures such as hiding or deleting the relevant post depending on the result. Records of reviews may be retained as needed for operations.",
                "Abuse of reports or blocking, including false reports or use for harassment, is prohibited. If the Service deems such conduct inappropriate, it may impose usage restrictions or other measures.",
              ],
            },
            {
              title: "Article 10 (Governing Law and Jurisdiction)",
              description: "Governing law and court jurisdiction",
              paragraphs: [
                "These Terms shall be governed by the laws of Japan. If any dispute arises in connection with the Service, the court with jurisdiction over the location of the Service's head office shall have exclusive agreed jurisdiction.",
              ],
            },
          ] satisfies Section[],
        };

  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold md:text-2xl">{copy.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{copy.description}</p>
      </div>

      <div className="grid gap-6">
        {copy.sections.map((section) => {
          const Icon = section.icon ? icons[section.icon] : null;

          return (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {Icon ? <Icon className="h-4 w-4 text-gray-500" /> : null}
                  {section.title}
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mb-3 text-sm text-gray-800 last:mb-0">
                    {paragraph}
                  </p>
                ))}
                {section.list ? (
                  <ul className="list-disc list-inside space-y-2 text-sm text-gray-800">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
