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

  const draftBanner =
    locale === "ja"
      ? "本ページは弁護士レビュー前のドラフトです。最終版とは内容が異なる場合があります。"
      : "This page is a draft pending legal review. Final wording may differ.";

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
                "生成した画像データ、入力プロンプト、利用したスタイリングカード等の生成パラメータ",
                "ユーザーが投稿した画像、コメント、いいね等のソーシャル機能上のアクション",
                "決済情報（Stripe経由、当サービスでは直接保存しません）",
                "通報した投稿・カテゴリ・詳細内容（通報機能の利用時）",
                "ブロックしたユーザー・ブロックされたユーザーとの関係（ブロック機能の利用時）",
                "アクセスログ、IPアドレス、ブラウザ情報、端末情報、Cookie 等",
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
                "利用規約・コミュニティガイドラインに違反した行為への対応、段階的執行措置の判断",
                "通報・ブロック・コンテンツ審査の実施（不適切なコンテンツの排除、トラブル防止）",
                "当サービスの新機能、更新情報、キャンペーン等の案内",
                "利用状況の分析、サービス改善のための統計データの作成",
                "不正利用の防止、セキュリティ対策、CSAM 等の重大違反コンテンツの検知・関係当局への通報および証拠保全",
                "当サービスの安全性・モデレーション精度・出力品質を改善するための、社内に閉じた統計的・機械的解析",
              ],
            },
            {
              icon: "database",
              title: "2-2. 生成 AI モデルの学習および当サービスによる二次利用",
              description: "ユーザーコンテンツの学習・二次利用に関する方針",
              paragraphs: [
                "当サービスは、ユーザーが入力したプロンプト、生成画像、投稿画像、その他のユーザーコンテンツを、ユーザーの個別の同意なく、第三者または汎用 AI モデルの学習データとして提供することはありません。",
                "当サービスは、安全性向上、不正利用検知、モデレーション、品質改善、当サービスのプロモーションに必要な範囲で、ユーザーコンテンツを内部的に解析・保管することがあります。具体的な許諾範囲は利用規約に従います。",
                "当サービスが将来的に、ユーザーコンテンツを学習用途・第三者提供等の追加目的で利用する場合は、事前にプライバシーポリシーを改定し、必要に応じてユーザーへ通知の上、適切な方法で同意取得またはオプトアウト手段を提供します。",
              ],
            },
            {
              icon: "lock",
              title: "3. 個人情報の管理",
              description: "個人情報の安全管理について",
              paragraphs: [
                "当サービスは、個人情報の漏洩、滅失または毀損の防止その他の個人情報の安全管理のため、必要かつ適切な措置を講じます。個人情報の取扱いに関する責任は、当サービスが負います。",
                "通報、執行措置、異議申立て等の記録は、モデレーションの一貫性確保および紛争対応のため、合理的な期間内で保持します。",
              ],
            },
            {
              icon: "database",
              title: "4. 個人情報の第三者提供",
              description: "第三者への提供について",
              paragraphs: [
                "当サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供することはありません。",
                "なお、当サービスは、Supabase（認証・データベース・ストレージサービス）、Stripe（決済サービス）、画像生成 API 提供元（OpenAI、Google 等）、その他のクラウドインフラ事業者を利用しており、これらのサービス提供者に必要な範囲でデータが提供される場合があります。これらのサービス提供者は、それぞれのプライバシーポリシーに従って個人情報を管理します。",
              ],
              list: [
                "ユーザーの同意がある場合",
                "法令に基づく場合",
                "人の生命、身体または財産の保護のために必要がある場合",
                "公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合（CSAM の発見時に関係当局へ通報する場合を含みます）",
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
                "ただし、不正利用の調査、紛争対応、法令上の保存義務、CSAM の証拠保全等の必要がある場合、削除請求に対しても合理的な範囲で当該データを保持することがあります。",
              ],
            },
            {
              title: "7. 退会・アカウント削除時の取扱い",
              description: "退会手続き時のデータの取扱いについて",
              paragraphs: [
                "ユーザーが退会手続きを行った場合、退会申請時点で投稿中の画像は投稿取り消し（非公開）となります。また、当サービスは退会申請日から30日間の経過後にアカウントを完全削除します。完全削除時には、当サービス内で当該ユーザーに紐づくデータ（プロフィール情報、生成画像、投稿画像、コメント、いいね、通報履歴、ブロック関係、保有ペルコイン残高等）を削除し、復元できません。",
                "ただし、不正利用調査、法令上の保存義務、CSAM 等重大違反に関する証拠保全、当サービスの紛争対応に必要な記録については、削除後も合理的な期間保持することがあります。",
              ],
            },
            {
              title: "8. プライバシーポリシーの変更",
              description: "プライバシーポリシーの変更について",
              paragraphs: [
                "当サービスは、必要に応じて、本プライバシーポリシーを変更することがあります。変更後のプライバシーポリシーは、本ページに掲載した時点で効力を生じるものとします。学習用途・第三者提供等、ユーザー権利に大きな影響を与える変更を行う場合は、合理的な範囲で事前に告知します。",
              ],
            },
            {
              title: "9. お問い合わせ窓口",
              description: "個人情報に関するお問い合わせについて",
              paragraphs: [
                "本プライバシーポリシーに関するお問い合わせは、以下のメールアドレスまでご連絡ください。",
              ],
            },
          ] as Section[],
        }
      : {
          title: "Privacy Policy",
          description:
            "This is the Privacy Policy for Persta.AI. The Japanese version is the authoritative text. This English version is a brief notice while the full translation is being prepared — please consult the Japanese version for binding terms.",
          sections: [
            {
              icon: "shield",
              title: "Notice",
              description: "English translation pending",
              paragraphs: [
                "The full English translation of this Privacy Policy is being prepared. For the binding terms, please consult the Japanese version of this page.",
                "Major topics covered in the Japanese version include: information collected by the Service, purposes of use, the Service's policy on AI training and operator secondary use of user content, security management, provision to third parties (including service providers and emergency disclosure to authorities for CSAM), use of cookies, disclosure/correction/deletion requests, retention on withdrawal, and contact information.",
              ],
            },
            {
              icon: "lock",
              title: "Contact",
              description: "Questions regarding personal information",
              paragraphs: [
                "If you have any questions about this Privacy Policy, please contact us at the email address below.",
              ],
            },
          ] as Section[],
        };

  return (
    <main className="mx-auto w-full max-w-screen-md px-4 py-6 md:py-10">
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {draftBanner}
      </div>
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
                {section.title.endsWith("お問い合わせ窓口") || section.title === "Contact" ? (
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
