import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import {
  AlertCircle,
  Coins,
  FileText,
  Gavel,
  Image as ImageIcon,
  Scale,
  Shield,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

type Section = {
  title: string;
  description: string;
  icon?: "file" | "shield" | "alert" | "coins" | "image" | "scale" | "shop" | "gavel";
  paragraphs?: string[];
  list?: string[];
};

const icons = {
  file: FileText,
  shield: Shield,
  alert: AlertCircle,
  coins: Coins,
  image: ImageIcon,
  scale: Scale,
  shop: ShoppingBag,
  gavel: Gavel,
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

  const draftBanner =
    locale === "ja"
      ? "本ページは弁護士レビュー前のドラフトです。最終版とは内容が異なる場合があります。"
      : "This page is a draft pending legal review. Final wording may differ.";

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
                "本規約に加え、当サービスが別途定める「コミュニティガイドライン」「プライバシーポリシー」「資金決済法に基づく表示」「特定商取引法に基づく表示」その他の個別規定も、本規約の一部を構成するものとします。本規約と個別規定の間に齟齬がある場合、本規約が優先します。",
              ],
            },
            {
              icon: "shield",
              title: "第2条（利用登録）",
              description: "アカウント登録について",
              paragraphs: [
                "当サービスの利用を希望する方は、本規約に同意の上、当サービスの定める方法によって利用登録を申請し、当サービスがこれを承認することによって、利用登録が完了するものとします。",
                "利用登録は、満13歳以上の方に限り行うことができます。満18歳未満の方が利用登録を行う場合は、保護者の同意を得たうえで利用してください。当サービスは年齢確認の手続きを行っていないため、年齢に関する正確性はユーザー自身の表明に依拠します。",
              ],
            },
            {
              icon: "alert",
              title: "第3条（禁止事項）",
              description: "利用にあたっての禁止事項",
              paragraphs: [
                "ユーザーは、当サービスの利用にあたり、以下の行為を行ってはなりません。本条各号に該当する投稿・生成・行為は、当サービスの判断により予告なく削除・非公開化・利用制限の対象となります。",
              ],
              list: [
                "法令または公序良俗に違反する行為",
                "犯罪行為に関連する行為",
                "児童（18歳未満の実在・架空を問わない者）を性的に描写・暗示するコンテンツ（CSAM／児童性的搾取コンテンツ）の生成・投稿・共有・要求行為。発見した場合、当サービスは当該アカウントを直ちに永久停止し、関係当局への通報および証拠保全を行います。",
                "実在人物（著名人を含む）の同意のない性的・侮辱的・なりすまし的描写、ディープフェイクポルノに該当する生成および投稿",
                "極端な暴力、自傷・自殺の助長、違法薬物の推奨、テロや差別の煽動その他、社会通念上著しく不適切なコンテンツの生成・投稿",
                "当サービスの内容、スタイリングカード、UI、ロゴその他に含まれる著作権、商標権、意匠権、肖像権、パブリシティ権その他の知的財産権・人格権を侵害する行為",
                "第三者の著作物、トレードドレス、商標、キャラクター等を権利者の許諾なく模倣・再現する目的でのプロンプト投入・スタイリングカード作成・共有",
                "当サービス、ほかのユーザー、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為",
                "クローラ、ボット、スクレイピング、API の不正利用、レートリミット回避その他、当サービスが想定しない方法での自動的な情報取得または操作",
                "当サービスを通じて取得した第三者の生成画像・プロフィール情報等を、本規約および別途定めるライセンス範囲を超えて再配布・商業利用する行為",
                "当サービスの運営、モデレーション、通報・審査機能の運営を妨害するおそれのある行為",
                "不正アクセスをし、またはこれを試みる行為、複数アカウントの不正な使い分け、停止処分を回避する目的での再登録",
                "他のユーザーに対する嫌がらせ、誹謗中傷、差別的表現等の投稿、または権利侵害・法令違反のおそれのあるコンテンツの投稿",
                "通報制度の濫用（虚偽の通報、嫌がらせ目的の通報、組織的な大量通報等）",
                "その他、当サービスが不適切と判断する行為",
              ],
            },
            {
              icon: "image",
              title: "第3条の2（知的財産権の尊重とユーザーによる保証）",
              description: "アップロード・生成・投稿に関する権利関係",
              paragraphs: [
                "ユーザーは、自らが当サービスへアップロード、入力、または生成（以下「ユーザーコンテンツ」と総称）するコンテンツについて、必要な権利を有していること、または権利者から適法な許諾を得ていることを当サービスに対して表明・保証します。",
                "ユーザーは、第三者の著作権、商標権、意匠権、肖像権、パブリシティ権、プライバシー権その他一切の権利を侵害しないことを保証し、当サービスが第三者から権利侵害の主張を受けた場合、自らの費用と責任において当該紛争を解決し、当サービスを免責するものとします。",
                "当サービスは、画像生成、スタイリングカード、フィルタその他の機能について、特定のコンテンツの権利関係を個別に審査・保証する立場になく、ユーザー間およびユーザーと第三者との間の権利関係について中立の立場を取ります。",
                "当サービス内で提供されるスタイリングカード、サンプル画像、UI 部品、ロゴ、サービス名その他の素材は、当サービスまたは正当な権利者に帰属します。当サービスが明示的に許諾した範囲を超えて、これらを複製、改変、再配布、商用利用することはできません。",
                "権利侵害の通知（DMCA に相当する申立てを含む）は、当サービス所定の通報フォームまたはお問い合わせ窓口から、対象コンテンツの URL、侵害の根拠、申立人の氏名・連絡先、宣誓内容を明記の上ご連絡ください。当サービスは内容を確認のうえ、必要と判断した場合、当該コンテンツの削除・非公開化、投稿者への通知、再投稿の防止等の措置を講じます。虚偽の申立ては禁止します。",
              ],
            },
            {
              icon: "scale",
              title: "第3条の3（コンテンツの分類および表示制限）",
              description: "NSFW 等センシティブなコンテンツの取扱い",
              paragraphs: [
                "当サービスは、安全で持続可能なコミュニティ運営のため、コンテンツの内容に応じて表示・配信を制限することがあります。具体的な分類および禁止事項の詳細は、別途定めるコミュニティガイドラインに従います。",
                "当サービスは現時点で、年齢確認手続を実装していません。ユーザーは満13歳以上であること、性的表現を含む可能性のある機能を利用する場合は当該機能を利用できる年齢に達していることを自己責任で確認するものとします。年齢に関する虚偽の表明は禁止事項に該当します。",
                "当サービスは、生成モデル側の安全フィルタ設定が状況に応じて緩和される場合があり、その場合でもコミュニティガイドラインで禁止しているコンテンツ（児童描写、実在人物の非同意ヌード、極端な暴力等）を生成・投稿することは一切認めません。生成モデルが結果を返した場合でも、その出力が本規約・コミュニティガイドラインに違反する場合は禁止事項に該当します。",
                "現在の運用では、センシティブなコンテンツの検出・対応はユーザーからの通報に依拠する部分があります。違反コンテンツを発見した場合は、通報機能を通じてご連絡ください。当サービスは通報の重み付けに基づく自動非表示および人手による審査を組み合わせて対応します。",
              ],
            },
            {
              icon: "image",
              title: "第3条の4（コンテンツの使用許諾および再利用）",
              description: "ユーザーコンテンツに対する許諾範囲",
              paragraphs: [
                "ユーザーコンテンツの著作権その他の権利は、原則としてユーザーまたは正当な権利者に帰属します。当サービスは、ユーザーが当サービス上に公開・保存することに同意したコンテンツに限り、当サービスの提供・運営・改善・宣伝に必要な範囲で、無償・非独占的に、世界中で利用（複製、表示、配信、サムネイル化、機械的解析、モデレーション目的での保存、サンプル表示、SNS 等での当サービス紹介における引用を含みます）できる権利を有するものとします。",
                "当サービスは、ユーザーコンテンツおよび入力プロンプトを、ユーザーの個別の同意なく、第三者の汎用 AI モデルの学習データとして提供することはありません。ただし、当サービスの安全性向上、不正利用検知、モデレーション精度向上、品質改善のための統計的・機械的な解析および内部ログの保持を行うことがあります。",
                "他のユーザーが公開された生成画像・スタイリングカード等を二次利用する場合、本規約および当サービスが提示するライセンス表示の範囲内に限られ、原作者を不当に害する形での再配布・改変・なりすましは禁止します。",
                "当サービスは、明らかに本規約・コミュニティガイドラインに違反するユーザーコンテンツについては、通知の有無を問わず削除・非公開化することがあります。削除されたコンテンツに関するユーザー側の損失について、当サービスは責任を負いません。",
              ],
            },
            {
              icon: "shop",
              title: "第3条の5（商用利用および透明性の確保）",
              description: "生成画像の商用利用とクレジット表記",
              paragraphs: [
                "ユーザーが当サービス上で生成した画像の個人的・非商用利用については、本規約および第三者の権利を侵害しない範囲で、原則として自由に行うことができます。",
                "商用利用（販売、広告、有償コンテンツへの組込み、商品化、第三者向けサービス提供等を含みます）を行う場合、ユーザーは以下を遵守するものとします。",
              ],
              list: [
                "生成元のスタイリングカード、参照画像、プロンプトに含まれる第三者の権利（著作権、商標権、肖像権等）を侵害していないことを自己の責任で確認すること",
                "実在人物に関連する生成物については、当該人物の同意を得ていること、または法令上許容される範囲内であることを確認すること",
                "AI による生成物であることを、利用先の媒体・取引慣行に応じて適切に明示すること（生成 AI を用いた旨のクレジット、AI generated 等の表示）",
                "当サービスが、商用利用に関する追加の規約、料金プラン、API 利用条件等を別途定めた場合は、それに従うこと",
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
                "当サービスは、生成 AI モデルが返す出力の正確性、安全性、適法性、第三者の権利を侵害しないことを保証しません。生成結果の利用に伴う責任はユーザーが負います。",
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
              icon: "gavel",
              title: "第9条の2（モデレーションの執行および異議申立て）",
              description: "通報・ブロック機能、段階的執行、異議申立てについて",
              paragraphs: [
                "当サービスは、不適切なコンテンツの排除およびユーザー間のトラブル防止のため、通報・ブロック・コンテンツ審査の機能を提供しています。執行の運用は、コミュニティガイドラインおよび本条に従うものとします。",
              ],
              list: [
                "通報：ユーザーは、他のユーザーの投稿が利用規約・コミュニティガイドラインまたは法令に反する等と判断した場合、所定の方法で通報することができます。通報された投稿は、通報の重み付けが一定のしきい値に達した時点で審査待ちとなり、審査が完了するまで当サービス上で全ユーザーに非表示となる場合があります。",
                "ブロック：ユーザーは、他のユーザーをブロックすることができます。ブロックしたユーザーの投稿は、当該ユーザーの画面に表示されません。ブロック関係は、アカウント画面から解除できます。",
                "段階的執行：当サービスは違反の重大性、反復性、悪質性等を勘案し、原則として（1）警告、（2）当該コンテンツの非公開・削除、（3）一時的な機能制限または一時停止、（4）永久停止の段階的措置を講じます。ただし、CSAM、深刻な権利侵害、明確な犯罪行為、重大な安全リスクが認められる場合は、警告等の段階を経ずに永久停止を含む厳格な措置を講じます。",
                "停止区分：一時停止と永久停止を区別して運用します。一時停止中はログイン・投稿等の一部機能が制限されます。永久停止された場合、原則として再登録は認められません。停止区分の判断および期間は当サービスが決定します。",
                "異議申立て：執行措置を受けたユーザーは、当サービス所定の方法により、措置の通知から原則として14日以内に異議を申し立てることができます。異議申立てには、対象措置、対象コンテンツ、申立ての理由を明記してください。当サービスは合理的な期間内に再審査を行い、結果を通知します。CSAM 等明白かつ重大な違反については、異議申立てを認めない場合があります。",
                "通報・ブロックの濫用（虚偽通報、嫌がらせ目的の利用、組織的大量通報等）は禁止事項とし、当サービスが不適切と判断した場合には利用制限等の対応を行うことがあります。",
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
          description:
            "These are the Terms of Service for Persta.AI. The Japanese version is the authoritative text. This English version is a brief notice while the full translation is being prepared — please consult the Japanese version for binding terms.",
          sections: [
            {
              icon: "file",
              title: "Notice",
              description: "English translation pending",
              paragraphs: [
                "The full English translation of these Terms of Service is being prepared. For the binding terms, please consult the Japanese version of this page.",
                "Major topics covered in the Japanese version include: scope of these Terms, account registration, prohibited acts (including CSAM, IP infringement, deepfake pornography), intellectual property and user warranties, content classification and display restrictions, content license to the Service, commercial use and transparency, suspension of the Service, disclaimer, Percoins, changes to the Terms, withdrawal and account deletion, graduated moderation enforcement and appeals, and governing law.",
              ],
            },
          ] satisfies Section[],
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
