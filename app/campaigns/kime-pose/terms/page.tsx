import type { Metadata } from "next";
import Link from "next/link";
import { AmazonGiftCardNotice } from "@/features/campaigns/kime-pose/components/AmazonGiftCardNotice";
import { KIME_POSE as CAMPAIGN } from "@/features/campaigns/kime-pose/kime-pose";

/**
 * 11月の企画「うちの子の決めポーズ」の応募規約(2026-10-30)。
 *
 * ハロウィン企画の規約(/campaigns/halloween-best-shot/terms)と同じ12条の形。ちがいは次のとおり
 * (2026-10-30 ユーザー決定):
 * - 応募期間のあとに投票期間がある。投票 = 応募作で生成すること。票はいつもの利用回数で、応募期間中の生成も含める
 * - 賞は使われた回数の多い順。審査・抽選はない
 * - 参加は18歳以上。Amazonギフトカードは日本国内にお住まいの方だけ、ペルコインは海外にお住まいの方も受け取れる
 *   (Amazonギフトカードは Amazon.co.jp 専用のため)
 * 賞品・期間は企画ページと同じ設定から出す(書き写さない)。
 */

export const metadata: Metadata = {
  title: `${CAMPAIGN.titleJp} 応募規約 | Persta.AI`,
  description: `企画「${CAMPAIGN.titleJp}」の応募規約・注意事項。`,
  // 検索には出さない(企画ページだけ出す。ハロウィンと同じ)
  robots: { index: false, follow: true },
};

const LINK_CLASS = "text-violet-600 underline hover:text-violet-700";

const [AMAZON_PRIZE, PERCOIN_PRIZE] = CAMPAIGN.prizes;

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

export default function KimePoseTermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      <p className="text-xs font-bold tracking-wide text-violet-600">CAMPAIGN</p>
      <h1 className="mt-1 text-2xl font-bold leading-relaxed text-gray-900">
        {CAMPAIGN.titleJp}
        <br />
        応募規約
      </h1>
      <p className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900">
        うちの子の決めポーズの作品を投稿し、ほかのユーザーに使われた回数の多い作品に、
        <span className="font-bold">
          {AMAZON_PRIZE.gift}（{AMAZON_PRIZE.amount}
          {AMAZON_PRIZE.unit}）
        </span>
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

      <Section no="02" title="応募期間・投票期間">
        <p>応募期間：{CAMPAIGN.submitPeriodFullLabel}</p>
        <p>投票期間：{CAMPAIGN.votePeriodFullLabel}</p>
        <p className="text-gray-500">
          ※ 応募期間中に投稿された作品を対象とします。期間外に投稿された作品は対象外です。
        </p>
      </Section>

      <Section no="03" title="参加資格">
        <p>次のすべてを満たす方が参加できます。</p>
        <ul className="list-disc space-y-1 pl-5">
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
        <p>
          {AMAZON_PRIZE.gift}の賞（{AMAZON_PRIZE.name}）は、日本国内にお住まいの方が対象です。ペルコインの賞（
          {PERCOIN_PRIZE.name}）は、海外にお住まいの方も対象です。
        </p>
        <p className="text-gray-500">※ Amazonギフトカードの受け取りには、Amazon.co.jpのアカウントが必要です。</p>
        <p className="text-gray-500">※ 主催者および本キャンペーンの関係者は参加できません。</p>
      </Section>

      <Section no="04" title="応募方法・投票">
        <p className="font-bold text-gray-900">応募</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>応募期間中に、Persta.AI の CREATE で決めポーズの作品を作ります。</li>
          <li>
            説明文にハッシュタグ<span className="font-bold">{CAMPAIGN.hashtag}</span>
            を付けて投稿します。投稿した作品が「応募作品」になり、ほかのユーザーが「このカタログで生成する」から使えるようになります。
          </li>
        </ol>
        <p className="text-gray-500">※ ほかのユーザーのカタログ（プロンプト）から作った作品は、応募作品の対象外です。</p>

        <p className="pt-2 font-bold text-gray-900">投票</p>
        <p>
          応募作品の「このカタログで生成する」から生成すると、1回の生成でその応募作品に1票が入ります。投稿しなくても数えます。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-gray-500">
          <li>応募期間中の生成も、票に数えます。投票期間の終わり（{CAMPAIGN.voteEndLabel}）までの生成を数えます。</li>
          <li>作品を投稿した本人が、自分の応募作品で生成したものは数えません。</li>
          <li>プロンプトをコピーして貼り付けた生成は数えません。</li>
          <li>主催者および本キャンペーンの関係者の生成は数えません。</li>
          <li>生成には、ペルコインが必要です。</li>
        </ul>

        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
          <span className="font-bold">参加にペルコインの購入は不要です。</span>
          無料でお付けしているペルコインで、応募・投票ができます。購入の有無は、結果に一切影響しません。
        </p>
      </Section>

      <Section no="05" title="賞品">
        <ul className="list-disc space-y-1 pl-5">
          {CAMPAIGN.prizes.map((prize) => (
            <li key={prize.name}>
              {prize.icon} {prize.name}（{prize.winners}）: {prize.gift} {prize.amount}
              {prize.unit}
            </li>
          ))}
        </ul>
        <ul className="list-disc space-y-1 pl-5 text-gray-500">
          <li>
            Amazonギフトカードは、ギフトカードの番号を当選者に個別にお送りします。Amazonギフトカードは、Amazon.co.jpでのみご利用いただけます。有効期限・利用条件は、Amazon の定めるところによります。
          </li>
          <li>ペルコインは、当選者のアカウントにお付けします。ペルコインには有効期限があります。</li>
          <li>賞は、1人1つまでです。</li>
        </ul>
      </Section>

      <Section no="06" title="選考・当選のご連絡">
        <p>
          応募期間の始まりから投票期間の終わりまでに、各応募作品が「このカタログで生成する」から生成された回数（04の数え方）を数え、多い順に受賞作品を決めます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {AMAZON_PRIZE.name}：日本国内にお住まいの方の応募作品のうち、いちばん多く生成された作品の方（{AMAZON_PRIZE.winners}）
          </li>
          <li>
            {PERCOIN_PRIZE.name}：{AMAZON_PRIZE.name}の作品を除いて、多く生成された作品の方から順に（{PERCOIN_PRIZE.winners}）
          </li>
          <li>同じ回数のときは、先に投稿された作品を上とします。</li>
          <li>1人で複数の作品が入ったときは、いちばん上の作品で1つの賞とし、次の作品の方へ繰り下げます。</li>
        </ul>
        <p>
          結果発表は {CAMPAIGN.announceLabel} を予定しています。受賞作品とクリエイターは、特設ページでご紹介します。
        </p>
        <p>
          当選者には、Persta.AI 内のお知らせでのみ、個別にご連絡します。お知らせに記載の期限までにお手続きがない場合、当選が無効となる場合があります。
        </p>
        <p>
          Amazonギフトカードは、お知らせに記載のフォームで受け取り用のメールアドレスをご登録いただき、メールでお送りします。公開の場ではお送りしません。
        </p>
        <p className="text-gray-500">※ 選考の内容や、作品ごとの回数についてのお問い合わせには、お答えできません。</p>
      </Section>

      <Section no="07" title="応募・当選が無効となる場合">
        <p>次の場合は、主催者の判断で応募または当選を無効とします。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>参加資格を満たさないことがわかった場合</li>
          <li>
            複数アカウントの利用、自動化ツールの利用、投稿と取り消しの繰り返しなど、不正な方法で参加した場合や、生成の回数を不正に増やした場合
          </li>
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
          主催者は、応募の確認・選考・当選のご連絡・賞品のお届け・不正の防止・お問い合わせへの対応・法令の遵守のために、Persta.AI のアカウント情報、投稿、生成の記録、当選のご連絡や賞品のお届けに必要なメールアドレス等を利用します。
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
        <p>本規約は日本法に準拠します。</p>
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
