import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Database, Eye, Lock, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

type Section = {
  title: string;
  description: string;
  icon?: "shield" | "eye" | "lock" | "database";
  paragraphs?: string[];
  list?: string[];
};

const icons = {
  shield: Shield,
  eye: Eye,
  lock: Lock,
  database: Database,
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "プライバシーポリシー" : "Privacy Policy",
    description:
      locale === "ja"
        ? "Persta.AI のプライバシーポリシー"
        : "Privacy Policy for Persta.AI",
    path: "/privacy",
    locale,
  });
}

export default async function PrivacyPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  const copy =
    locale === "ja"
      ? {
          title: "プライバシーポリシー",
          description: "「Persta.AI」のプライバシーポリシーです。",
          sections: [
            {
              icon: "shield",
              title: "1. 個人情報の取得について",
              description: "当サービスが取得する個人情報について",
              paragraphs: ["当サービスは、以下の個人情報を取得いたします。"],
              list: [
                "メールアドレス（認証用）",
                "ニックネーム（表示名）",
                "プロフィール画像（任意）",
                "生成した画像データ",
                "決済情報（Stripe経由、当サービスでは直接保存しません）",
                "通報した投稿・カテゴリ・詳細内容（通報機能の利用時）",
                "ブロックしたユーザー・ブロックされたユーザーとの関係（ブロック機能の利用時）",
                "アクセスログ、IPアドレス、ブラウザ情報等",
              ],
            },
            {
              icon: "eye",
              title: "2. 個人情報の利用目的",
              description: "取得した個人情報の利用目的について",
              paragraphs: ["当サービスは、取得した個人情報を以下の目的で利用いたします。"],
              list: [
                "当サービスの提供、運営、管理",
                "ユーザーからのお問い合わせへの対応",
                "利用規約に違反した行為への対応",
                "通報・ブロック・コンテンツ審査の実施（不適切なコンテンツの排除、トラブル防止）",
                "当サービスの新機能、更新情報、キャンペーン等の案内",
                "利用状況の分析、サービス改善のための統計データの作成",
                "不正利用の防止、セキュリティ対策",
              ],
            },
            {
              icon: "lock",
              title: "3. 個人情報の管理",
              description: "個人情報の安全管理について",
              paragraphs: [
                "当サービスは、個人情報の漏洩、滅失または毀損の防止その他の個人情報の安全管理のため、必要かつ適切な措置を講じます。個人情報の取扱いに関する責任は、当サービスが負います。",
              ],
            },
            {
              icon: "database",
              title: "4. 個人情報の第三者提供",
              description: "第三者への提供について",
              paragraphs: [
                "当サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供することはありません。",
                "なお、当サービスは、Supabase（認証・データベース・ストレージサービス）およびStripe（決済サービス）を利用しており、これらのサービス提供者に個人情報が提供される場合があります。これらのサービス提供者は、それぞれのプライバシーポリシーに従って個人情報を管理します。",
              ],
              list: [
                "ユーザーの同意がある場合",
                "法令に基づく場合",
                "人の生命、身体または財産の保護のために必要がある場合",
                "公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合",
                "国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合",
              ],
            },
            {
              title: "5. Cookie等の利用",
              description: "Cookie等の利用について",
              paragraphs: [
                "当サービスは、ユーザーによりよいサービスを提供するため、Cookie等の技術を使用することがあります。Cookieは、ユーザーのコンピュータに識別子を保存することにより、当サービスの利用状況を把握するために使用されます。ユーザーは、ブラウザの設定により、Cookieの受け取りを拒否することができます。",
              ],
            },
            {
              title: "6. 個人情報の開示・訂正・削除",
              description: "個人情報の開示等の請求について",
              paragraphs: [
                "ユーザーは、当サービスが保有する自己の個人情報について、開示、訂正、削除を求めることができます。これらの請求は、当サービスが定める方法により、当サービスにご連絡いただくことで対応いたします。",
              ],
            },
            {
              title: "7. 退会・アカウント削除時の取扱い",
              description: "退会手続き時のデータの取扱いについて",
              paragraphs: [
                "ユーザーが退会手続きを行った場合、退会申請時点で投稿中の画像は投稿取り消し（非公開）となります。また、当サービスは退会申請日から30日間の経過後にアカウントを完全削除します。完全削除時には、当サービス内で当該ユーザーに紐づくデータ（プロフィール情報、生成画像、投稿画像、コメント、いいね、通報履歴、ブロック関係、保有ペルコイン残高等）を削除し、復元できません。",
              ],
            },
            {
              title: "8. プライバシーポリシーの変更",
              description: "プライバシーポリシーの変更について",
              paragraphs: [
                "当サービスは、必要に応じて、本プライバシーポリシーを変更することがあります。変更後のプライバシーポリシーは、本ページに掲載した時点で効力を生じるものとします。",
              ],
            },
            {
              title: "9. お問い合わせ窓口",
              description: "個人情報に関するお問い合わせについて",
              paragraphs: [
                "本プライバシーポリシーに関するお問い合わせは、以下のメールアドレスまでご連絡ください。",
              ],
            },
          ] satisfies Section[],
        }
      : {
          title: "Privacy Policy",
          description: "This is the Privacy Policy for Persta.AI.",
          sections: [
            {
              icon: "shield",
              title: "1. Information We Collect",
              description: "Personal information collected by the Service",
              paragraphs: ["The Service collects the following personal information."],
              list: [
                "Email address (for authentication)",
                "Nickname (display name)",
                "Profile image (optional)",
                "Generated image data",
                "Payment information (via Stripe; the Service does not store it directly)",
                "Reported posts, categories, and detailed report contents when using the reporting feature",
                "Relationships involving blocked users when using the blocking feature",
                "Access logs, IP addresses, browser information, and related usage data",
              ],
            },
            {
              icon: "eye",
              title: "2. Purpose of Use",
              description: "How collected personal information is used",
              paragraphs: ["The Service uses collected personal information for the following purposes."],
              list: [
                "Providing, operating, and managing the Service",
                "Responding to user inquiries",
                "Addressing conduct that violates the Terms of Service",
                "Operating reporting, blocking, and content review processes to remove inappropriate content and prevent trouble",
                "Announcing new features, updates, and campaigns related to the Service",
                "Analyzing usage and preparing statistical data to improve the Service",
                "Preventing abuse and maintaining security",
              ],
            },
            {
              icon: "lock",
              title: "3. Management of Personal Information",
              description: "Security management of personal information",
              paragraphs: [
                "The Service takes necessary and appropriate measures to prevent leakage, loss, or damage of personal information and to otherwise manage such information securely. The Service is responsible for the handling of personal information.",
              ],
            },
            {
              icon: "database",
              title: "4. Provision to Third Parties",
              description: "Provision to third parties",
              paragraphs: [
                "Except in the following cases, the Service will not provide users' personal information to third parties.",
                "The Service uses Supabase (authentication, database, and storage services) and Stripe (payment services), and personal information may be provided to these providers as necessary. These providers handle personal information in accordance with their respective privacy policies.",
              ],
              list: [
                "When the user has given consent",
                "When required by laws or regulations",
                "When necessary to protect a person's life, body, or property",
                "When especially necessary for improving public health or promoting the sound development of children",
                "When cooperation is necessary for a national or local government body, or a party entrusted by such a body, to carry out duties prescribed by law",
              ],
            },
            {
              title: "5. Use of Cookies and Similar Technologies",
              description: "Use of cookies and similar technologies",
              paragraphs: [
                "The Service may use cookies and similar technologies to provide a better experience. Cookies help the Service understand how it is being used by storing identifiers on the user's device. Users can refuse cookies through their browser settings.",
              ],
            },
            {
              title: "6. Disclosure, Correction, and Deletion",
              description: "Requests concerning personal information",
              paragraphs: [
                "Users may request disclosure, correction, or deletion of their personal information held by the Service. Such requests can be handled by contacting the Service through the method designated by the Service.",
              ],
            },
            {
              title: "7. Handling on Withdrawal and Account Deletion",
              description: "How data is handled when a user withdraws",
              paragraphs: [
                "If a user completes a withdrawal procedure, any images currently posted by that user will be withdrawn from posting and made private at the time of the request. The Service will permanently delete the account 30 days after the withdrawal request. Upon permanent deletion, data linked to that user within the Service, including profile information, generated images, posted images, comments, likes, report history, block relationships, and Percoin balances, will be deleted and cannot be restored.",
              ],
            },
            {
              title: "8. Changes to this Privacy Policy",
              description: "Changes to the Privacy Policy",
              paragraphs: [
                "The Service may revise this Privacy Policy as needed. Any revised Privacy Policy becomes effective when posted on this page.",
              ],
            },
            {
              title: "9. Contact",
              description: "Questions regarding personal information",
              paragraphs: [
                "If you have any questions about this Privacy Policy, please contact us at the email address below.",
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
                {section.title.endsWith("お問い合わせ窓口") || section.title === "9. Contact" ? (
                  <p className="mt-2 text-sm text-gray-800">
                    <a href="mailto:yuh.products@gmail.com" className="text-primary underline underline-offset-2">
                      yuh.products@gmail.com
                    </a>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
