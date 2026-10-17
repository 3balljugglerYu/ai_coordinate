import type { Metadata } from "next";
import Link from "next/link";
import { AmazonGiftCardNotice } from "@/features/campaigns/halloween/components/AmazonGiftCardNotice";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "@/features/campaigns/halloween/halloween-best-shot";

/**
 * ハロウィン企画「うちの子のベストショット with Halloween Magic」の応募規約(2026-10-16)。
 *
 * 前回のことわざ企画の規約(/campaigns/kotowaza-lottery)と同じ12条の形。ユーザー提供の
 * 「Amazonギフトカード プレゼントキャンペーン注意事項」に沿って、対象の方(日本国内にお住まいの
 * 18歳以上。ユーザー決定)、購入不要(オープン懸賞)、Amazon.co.jp 専用、個別の当選連絡、
 * 決まった注記2つを書く。賞品・期間・口数は企画ページと同じ設定から出す(書き写さない)。
 */

const PAGE_TITLE = `${CAMPAIGN.titleJp} ${CAMPAIGN.titleEn} 応募規約 | Persta.AI`;
const PAGE_DESCRIPTION =
  "ハロウィン企画「うちの子のベストショット with Halloween Magic」の応募規約・注意事項。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // 検索には出さない(2026-10-17 に検索へ出したのは企画ページだけ)
  robots: { index: false, follow: true },
};

const LINK_CLASS = "text-violet-600 underline hover:text-violet-700";

const { creative, enjoy } = CAMPAIGN.prizeCategories;
const ALL_PRIZES = [...CAMPAIGN.prizes, ...CAMPAIGN.userPrizes];

/** Amazonギフトカードの合計(円)。賞品の設定から出す */
const AMAZON_TOTAL_YEN = ALL_PRIZES.filter((prize) => prize.gift === "Amazonギフトカード").reduce(
  (sum, prize) => sum + Number(prize.amount.replace(/,/g, "")) * Number.parseInt(prize.winners, 10),
  0,
);

/** 「3作品で1口、6作品で2口、10作品で3口」 */
const TICKETS_TEXT = CAMPAIGN.tickets.map((row) => `${row.works}作品で${row.tickets}口`).join("、");
const MAX_TICKETS = CAMPAIGN.tickets[CAMPAIGN.tickets.length - 1].tickets;

function Section({
  no,
  title,
  children,
}: {
  no: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2 text-base font-bold text-gray-900">
        <span className="text-sm text-violet-600">{no}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function PrizeList({
  category,
  prizes,
}: {
  category: { icon: string; name: string };
  prizes: readonly { icon: string; name: string; gift: string; amount: string; unit: string; winners: string }[];
}) {
  return (
    <>
      <p className="font-bold text-gray-900">
        {category.icon} {category.name}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {prizes.map((prize) => (
          <li key={prize.name}>
            {prize.icon} {prize.name}（{prize.winners}）: {prize.gift} {prize.amount}
            {prize.unit}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function HalloweenBestShotTermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      <p className="text-xs font-bold tracking-wide text-violet-600">CAMPAIGN</p>
      <h1 className="mt-1 text-2xl font-bold leading-relaxed text-gray-900">
        {CAMPAIGN.titleJp} {CAMPAIGN.titleEn}
        <br />
        応募規約
      </h1>
      <p className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900">
        ハロウィンをテーマにした作品を投稿する「{creative.name}」（審査）と、キャンペーン対象作品を使って楽しむ「
        {enjoy.name}」（抽選）で、
        <span className="font-bold">Amazonギフトカード（総額{AMAZON_TOTAL_YEN.toLocaleString("ja-JP")}円分）</span>
        とペルコインをプレゼントします。
      </p>

      <Section no="01" title="主催者">
        <p>
          本キャンペーンは、Persta.AI 運営者（以下「主催者」といいます。）が主催します。主催者の氏名・連絡先は
          <Link href="/tokushoho" className={LINK_CLASS}>
            特定商取引法に基づく表記
          </Link>
          に記載しています。
        </p>
        <p className="text-gray-500">※ 本キャンペーンは、Amazon とは一切関係ありません。</p>
      </Section>

      <Section no="02" title="応募期間">
        <p>{CAMPAIGN.periodFullLabel}</p>
        <p className="text-gray-500">
          ※ 応募期間中に投稿された作品を対象とします。期間外に投稿された作品は対象外です。
        </p>
      </Section>

      <Section no="03" title="参加資格">
        <p>次のすべてを満たす方が応募できます。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>日本国内にお住まいの方</li>
          <li>18歳以上の方</li>
          <li>Persta.AI のアカウントをお持ちの方（1人1アカウント）</li>
          <li>
            本規約、Persta.AI の
            <Link href="/terms" className={LINK_CLASS}>
              利用規約
            </Link>
            および
            <Link href="/community-guidelines" className={LINK_CLASS}>
              コミュニティガイドライン
            </Link>
            に同意いただける方
          </li>
        </ul>
        <p className="text-gray-500">※ Amazonギフトカードの受け取りには、Amazon.co.jpのアカウントが必要です。</p>
        <p className="text-gray-500">※ 主催者および本キャンペーンの関係者は応募できません。</p>
      </Section>

      <Section no="04" title="応募方法">
        <p className="font-bold text-gray-900">
          {creative.icon} {creative.name}（審査）
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>応募期間中に、Persta.AI の CREATE で作品を作ります。</li>
          <li>
            説明文にハッシュタグ<span className="font-bold">{CAMPAIGN.hashtag}</span>
            を付けて投稿します。投稿した作品が「キャンペーン対象作品」になり、ほかのユーザーが
            「このカタログで生成する」から使えるようになります。
          </li>
        </ol>
        <p className="text-gray-500">※ ほかのユーザーのカタログ（プロンプト）から作った作品は、{creative.name}の対象外です。</p>

        <p className="pt-2 font-bold text-gray-900">
          {enjoy.icon} {enjoy.name}（抽選）
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            企画ページの「エントリーする」からエントリーします。抽選はエントリーした方が対象です（エントリー前の投稿も数えます）。
          </li>
          <li>
            応募期間中に、キャンペーン対象作品の「このカタログで生成する」から生成した作品を投稿します（ハッシュタグは不要です）。
          </li>
          <li>
            使ったちがう対象作品の数に応じて、口数が決まります（{TICKETS_TEXT}。最大{MAX_TICKETS}口）。口数が多いほど当選しやすくなります。
          </li>
        </ol>
        <ul className="list-disc space-y-1 pl-5 text-gray-500">
          <li>同じ対象作品は、何回使っても1作品と数えます。</li>
          <li>自分の対象作品を使った投稿は数えません。</li>
          <li>プロンプトをコピーして貼り付けた投稿は数えません。</li>
          <li>投稿を取り消すと、その分は数えなくなります。</li>
        </ul>

        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
          <span className="font-bold">参加にペルコインの購入は不要です。</span>
          購入の有無は、審査・抽選の結果に一切影響しません。
        </p>
      </Section>

      <Section no="05" title="賞品">
        <PrizeList category={creative} prizes={CAMPAIGN.prizes} />
        <PrizeList category={enjoy} prizes={CAMPAIGN.userPrizes} />
        <ul className="list-disc space-y-1 pl-5 text-gray-500">
          <li>
            Amazonギフトカードは、ギフトカードの番号を当選者に個別にお送りします。Amazonギフトカードは、Amazon.co.jpでのみご利用いただけます。有効期限・利用条件は、Amazon の定めるところによります。
          </li>
          <li>ペルコインは、当選者のアカウントにお付けします。ペルコインには有効期限があります。</li>
          <li>
            {creative.name}と{enjoy.name}の、両方には当選しません。
          </li>
        </ul>
      </Section>

      <Section no="06" title="審査・抽選・当選のご連絡">
        <p>
          {creative.name}は、企画ページの「審査のポイント」をもとに主催者が審査し、受賞作品を決定します。
        </p>
        <p>{enjoy.name}は、エントリーした方を対象に、口数に応じて主催者所定の方法により厳正に抽選します。</p>
        <p>
          結果発表は、応募期間の終了後1週間程度を予定しています。{creative.name}
          の受賞作品とクリエイターは、特設ページでご紹介します。
        </p>
        {/* 当選後の流れ(2026-10-16 ユーザー決定): 連絡は Persta.AI 内のお知らせだけ(なりすまし対策)、
            Amazonギフトカードはフォームで受け取り用のメールアドレスを登録してもらい、メールで送る */}
        <p>
          当選者には、Persta.AI 内のお知らせでのみ、個別にご連絡します。お知らせに記載の期限までにお手続きがない場合、当選が無効となる場合があります。
        </p>
        <p>
          Amazonギフトカードは、お知らせに記載のフォームで受け取り用のメールアドレスをご登録いただき、メールでお送りします。公開の場ではお送りしません。
        </p>
        <p className="text-gray-500">※ 審査の内容や抽選の結果についてのお問い合わせには、お答えできません。</p>
      </Section>

      <Section no="07" title="応募・当選が無効となる場合">
        <p>次の場合は、主催者の判断で応募または当選を無効とします。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>参加資格を満たさないことがわかった場合</li>
          <li>複数アカウントの利用、自動化ツールの利用、投稿と取り消しの繰り返しなど、不正な方法で参加した場合</li>
          <li>本規約、Persta.AI の利用規約・コミュニティガイドライン、または法令に違反した場合</li>
          <li>第三者の権利を侵害する作品や、虚偽の内容があった場合</li>
        </ul>
      </Section>

      <Section no="08" title="作品の取扱い">
        <p>応募者は、応募作品が第三者の権利を侵害しないことを保証するものとします。</p>
        <p>
          応募者は主催者に対し、結果発表・広報（Persta.AI 内・SNS・Web）のために必要な範囲で、応募作品を無償・非独占的に利用する権利を許諾するものとします。その際、Persta.AI の表示名を記載する場合があります。
        </p>
      </Section>

      <Section no="09" title="個人情報の取扱い">
        <p>
          主催者は、応募の確認・抽選・当選のご連絡・賞品のお届け・不正の防止・お問い合わせへの対応・法令の遵守のために、Persta.AI のアカウント情報、投稿、当選のご連絡や賞品のお届けに必要なメールアドレス等を利用します。
        </p>
        <p>
          取得した個人情報は、法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。詳しくは
          <Link href="/privacy" className={LINK_CLASS}>
            プライバシーポリシー
          </Link>
          をご確認ください。
        </p>
      </Section>

      <Section no="10" title="税金の取扱い">
        <p>賞品の受領に伴い税務上の取扱いが生じる場合は、当選者ご自身の責任と負担において対応いただきます。</p>
      </Section>

      <Section no="11" title="変更・中止">
        <p>
          主催者は、法令またはプラットフォームのルール変更、システム障害その他やむを得ない事情により、本キャンペーンの内容を変更・中断・中止することがあります。その場合は、企画ページなどでお知らせします。
        </p>
      </Section>

      <Section no="12" title="準拠法">
        <p>本規約は日本法に準拠し、日本国内にお住まいの方を対象とします。</p>
      </Section>

      <AmazonGiftCardNotice
        className="mt-10 space-y-2 rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600"
        linkClassName={LINK_CLASS}
      />

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href={CAMPAIGN.path} className="font-bold text-violet-600 underline hover:text-violet-700">
          ← 企画ページへ戻る
        </Link>
      </div>
    </main>
  );
}
