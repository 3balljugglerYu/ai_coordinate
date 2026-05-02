import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import {
  AlertCircle,
  Ban,
  Eye,
  Flag,
  Gavel,
  HeartHandshake,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

type Section = {
  title: string;
  description: string;
  icon?: "scroll" | "ban" | "eye" | "flag" | "gavel" | "heart" | "alert" | "shield";
  paragraphs?: string[];
  list?: string[];
};

const icons = {
  scroll: ScrollText,
  ban: Ban,
  eye: Eye,
  flag: Flag,
  gavel: Gavel,
  heart: HeartHandshake,
  alert: AlertCircle,
  shield: ShieldAlert,
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "コミュニティガイドライン" : "Community Guidelines",
    description:
      locale === "ja"
        ? "Persta.AI のコミュニティガイドライン。禁止コンテンツ、通報の使い方、執行方針について"
        : "Persta.AI Community Guidelines: prohibited content, reporting, and enforcement",
    path: "/community-guidelines",
    locale,
  });
}

export default async function CommunityGuidelinesPage() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  const copy =
    locale === "ja"
      ? {
          title: "コミュニティガイドライン",
          description:
            "Persta.AI（以下「当サービス」）を、すべてのユーザーが安心して利用できる場とするため、本ガイドラインを定めます。本ガイドラインは利用規約の一部を構成するものであり、違反した場合はコンテンツの非公開・削除、アカウント停止等の対応を行うことがあります。",
          sections: [
            {
              icon: "scroll",
              title: "1. 基本理念",
              description: "コミュニティが大切にしていること",
              paragraphs: [
                "当サービスは、AI 画像生成を通じた創作と交流の場です。すべての利用者が他者の権利と尊厳を尊重し、安全で持続可能なコミュニティを共に支えることを期待しています。",
                "創作の自由と他者の権利・安全との両立を図るため、本ガイドラインを設けています。明示的に禁止されていない行為であっても、本ガイドラインの精神に反する場合や、コミュニティに重大な悪影響を与えると当サービスが判断した場合は、執行措置の対象となることがあります。",
              ],
            },
            {
              icon: "ban",
              title: "2. 絶対に禁止されるコンテンツ",
              description: "発見次第、永久停止と当局通報の対象となるもの",
              paragraphs: [
                "以下のコンテンツの生成・投稿・共有・要求は、いかなる文脈においても禁止します。違反が確認された場合、当サービスは警告等の段階を経ずに当該アカウントを永久停止し、関係当局への通報および証拠保全を行います。",
              ],
              list: [
                "児童（18歳未満。実在・架空、写真・イラスト・3DCG・AI 生成いずれを問わない）を性的に描写・暗示するコンテンツ（CSAM／児童性的搾取コンテンツ）",
                "未成年と見受けられる人物の性的・暴力的描写、未成年に対する性的グルーミングを目的とするやり取り",
                "実在人物（著名人・一般人を問わず）の同意のない性的描写、ヌード化、ディープフェイクポルノ",
                "性的暴力（強姦、性的拷問等）を肯定的・賛美的に描くコンテンツ",
                "実在のテロ行為・大量殺人・人身売買等を称賛・教唆するコンテンツ",
                "リアルな自傷・自殺の方法を教示し、または実行を煽るコンテンツ",
              ],
            },
            {
              icon: "shield",
              title: "3. 一般的な禁止事項",
              description: "違反対応の対象となる主な行為",
              paragraphs: [
                "以下の行為は、違反の重大性・反復性に応じて、コンテンツの非公開・削除、またはアカウントの停止等の対応の対象となります。",
              ],
              list: [
                "他者への嫌がらせ、誹謗中傷、人種・性別・国籍・宗教等に基づく差別的表現",
                "個人情報（住所、電話番号、勤務先等）の同意なき開示、ストーキング、出会い目的の執拗な接触",
                "第三者の著作権、商標権、意匠権、肖像権、パブリシティ権、プライバシー権を侵害するコンテンツの生成・投稿",
                "他者のスタイリングカード、生成画像、プロンプトの無断転用および当サービスのライセンス範囲を超えた再配布",
                "違法薬物、武器の入手・使用方法の教示、賭博等、日本法または利用先地域の法令に違反するコンテンツ",
                "詐欺、フィッシング、マルチ商法、暗号資産等の不当な勧誘",
                "なりすまし行為（他人や運営を装う行為、所属を偽る行為）",
                "通報制度の濫用（虚偽通報、嫌がらせ目的の通報、組織的な大量通報）",
                "クローラ・ボット・自動化ツールによる不正利用、レートリミット回避、API の不正利用",
                "停止処分を回避する目的での再登録、複数アカウントの不正な使い分け",
                "本サービスの趣旨や雰囲気を著しく損なうコンテンツ。具体的には、過度に恐怖・不快感を与える描写、政治的・宗教的に偏った主張や論争を煽る表現、コーデや AI スタイリング要素を含まない投稿および特定ブランド・商品の宣伝に偏った投稿等、本サービスのコーディネート文脈と乖離した表現等を含みますが、これらに限られません。",
              ],
            },
            {
              icon: "eye",
              title: "4. センシティブ／NSFW コンテンツの取扱い",
              description: "暫定的な運用方針と利用者へのお願い",
              paragraphs: [
                "当サービスは、創作物の幅を不当に狭めないよう配慮しつつ、未成年保護および公共の場としての品位を最優先します。性的、暴力的、グロテスクな表現については、第2条・第3条で禁止する範囲を厳守してください。",
                "現時点で、当サービスは厳密な年齢確認手続きおよび NSFW コンテンツの自動判定機構を実装していません。性的・暴力的表現を含む可能性のある機能を利用する場合、ユーザーは自身が当該機能を利用できる年齢に達していることを自己責任で確認してください。年齢に関する虚偽の表明は禁止事項に該当します。",
                "生成 AI モデルの安全フィルタは、特定の状況に応じて個別の設定がなされている場合がありますが、そのような設定がなされているからといって本ガイドラインで禁止しているコンテンツの生成・投稿が許容されるわけではありません。生成結果の最終的な責任はユーザーが負います。",
                "現状、センシティブコンテンツへの対応は通報機能に大きく依拠しています。違反コンテンツを発見した場合は、後述の通報機能から速やかにご連絡ください。",
              ],
            },
            {
              icon: "scroll",
              title: "5. 知的財産権の尊重",
              description: "他者の権利を侵害しないために",
              paragraphs: [
                "当サービスは、創作と既存作品からの影響との関係について中立の立場を取りますが、第三者の権利を明らかに侵害する目的での生成・投稿は禁止します。",
                "特定のキャラクター、商標、意匠、有名作品のスタイル等を含むコンテンツ（いわゆる二次創作）の取扱いについては、各権利者が公開している利用規定・ガイドラインに従ってください。商用利用や営利を伴う公開、グッズ展開等を行う場合は、原則として権利者の事前許諾が必要です。個人的な創作の範囲においても、対象作品の権利関係に疑義がある場合は利用を控えるか権利者へ確認してください。",
                "自身の権利が侵害されていると判断した方は、後述の通報機能または当サービス所定の権利侵害通知の手続きを通じてご連絡ください。",
              ],
            },
            {
              icon: "flag",
              title: "6. 通報機能の使い方",
              description: "違反コンテンツや権利侵害を見つけたら",
              paragraphs: [
                "本ガイドラインまたは利用規約に違反すると思われる投稿を発見した場合、各投稿のメニューから通報機能をご利用ください。通報には以下のカテゴリ等を選択し、必要に応じて詳細をご記入ください。",
              ],
              list: [
                "児童描写・CSAM の疑い（最優先で審査します）",
                "実在人物の同意なき性的描写、ディープフェイクポルノ",
                "嫌がらせ、誹謗中傷、差別的表現",
                "著作権・商標権・肖像権等の権利侵害",
                "暴力、自傷・自殺の助長、違法薬物等",
                "なりすまし、スパム、詐欺",
                "その他コミュニティガイドライン違反",
              ],
            },
            {
              icon: "gavel",
              title: "7. 執行方針",
              description: "違反に対する当サービスの対応",
              paragraphs: [
                "当サービスは、違反の重大性、反復性、悪質性、コミュニティへの影響等を勘案し、現状では主に以下の対応を講じます。重大な違反（CSAM、深刻な権利侵害、明確な犯罪行為、重大な安全リスク等）については、即時に厳格な措置を講じます。",
              ],
              list: [
                "コンテンツの非公開・削除：通報の重み付けが一定のしきい値に達した時点で自動的に非公開化し、人手による審査の上で削除等を判断します。",
                "アカウント停止：違反の程度に応じて、運用上、一時的な停止と永続的な停止を使い分けます。停止された場合、ログイン後の機能の利用が制限されることがあります。永続的な停止に該当した場合、再登録はお断りすることがあります。",
                "当局通報・証拠保全：CSAM 等、法令上通報義務または通報の必要があると判断されるコンテンツについては、関係当局への通報および証拠保全を行います。",
                "今後の運用改善：警告制度や段階的な機能制限、停止期間の自動管理、再登録防止の仕組みなど、より細やかな対応手段については、運用の状況に応じて順次導入・強化していく予定です。",
                "運営裁量による非表示：上記の禁止事項に明示的に該当しない場合でも、本サービスの趣旨や雰囲気に著しく合わないと判断したコンテンツについては、運営の裁量により非表示とすることがあります。",
              ],
            },
            {
              icon: "heart",
              title: "8. 異議申立て",
              description: "措置を受けた場合の救済手続き",
              paragraphs: [
                "執行措置を受けたユーザーは、措置の通知から原則として14日以内に、当サービス所定の方法により異議を申し立てることができます。異議申立てには、対象措置、対象コンテンツ、申立ての理由を明記してください。",
                "当サービスは合理的な期間内に再審査を行い、結果を通知します。再審査の結果、措置が不適切であったと当サービスが判断した場合は、当該措置を取り消し、必要に応じてコンテンツの復元等を行います。",
                "ただし、CSAM 等、法令違反が明白かつ重大な事案については、異議申立てを認めない場合があります。",
              ],
            },
            {
              icon: "alert",
              title: "9. 商用利用および AI 生成物の透明性",
              description: "ビジネス利用にあたっての注意",
              paragraphs: [
                "個人的・非商用利用については、本ガイドラインおよび利用規約に従う限り、生成画像を比較的自由に利用できます。商用利用（販売、広告、商品化、有償コンテンツへの組込み等）を行う場合は、利用規約第3条の5の条件を遵守してください。",
                "また、AI 生成物であることを利用先の媒体・取引慣行に応じて適切に明示することを推奨します（例：「AI generated」「AI 生成」のクレジット表記）。これは、購入者・閲覧者に対する誠実な情報提供の観点で重要です。",
              ],
            },
            {
              icon: "scroll",
              title: "10. ガイドラインの変更",
              description: "本ガイドラインの更新について",
              paragraphs: [
                "本ガイドラインは、当サービスの成長、コミュニティの状況、関連法令の変化、技術的進歩等に応じて改定することがあります。重要な改定がある場合は、当サービス上で告知します。改定後も当サービスを継続して利用された場合、改定後のガイドラインに同意したものとみなします。",
              ],
            },
            {
              title: "11. お問い合わせ",
              description: "本ガイドラインに関するご質問",
              paragraphs: [
                "本ガイドラインの解釈や適用に関するご質問、緊急性の高い案件のご報告は、各投稿の通報機能のほか、以下のメールアドレスでも受け付けています。",
              ],
            },
          ] as Section[],
        }
      : {
          title: "Community Guidelines",
          description:
            "These are the Persta.AI Community Guidelines. The Japanese version is the authoritative text. This English version is a brief notice while the full translation is being prepared — please consult the Japanese version.",
          sections: [
            {
              icon: "scroll",
              title: "Notice",
              description: "English translation pending",
              paragraphs: [
                "The full English translation of these Community Guidelines is being prepared. For the binding text, please consult the Japanese version of this page.",
                "Topics covered in the Japanese version include: basic principles; absolutely prohibited content (CSAM, non-consensual sexual depiction of real people, deepfake pornography, glorification of sexual violence, etc.); general prohibited acts; the handling of sensitive/NSFW content and current operational limits (no strict age verification, reliance on user reports); intellectual property; how to use the reporting feature; graduated enforcement (warning, hide/delete, restriction, temporary suspension, permanent ban, escalation to authorities); appeals; commercial use and AI-generated content disclosure; and contact.",
              ],
            },
            {
              icon: "flag",
              title: "Contact",
              description: "Questions about these Guidelines",
              paragraphs: [
                "For questions about these Guidelines or to report urgent matters, please use the in-product reporting feature, or contact us at the email address below.",
              ],
            },
          ] as Section[],
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
                {section.title.endsWith("お問い合わせ") || section.title === "Contact" ? (
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
