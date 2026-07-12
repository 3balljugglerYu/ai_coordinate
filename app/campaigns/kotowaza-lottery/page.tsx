import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

const PAGE_TITLE = "うちの子のことわざ辞典 Xシェアキャンペーン 応募規約 | Persta.AI";
const PAGE_DESCRIPTION =
  "「うちの子のことわざ辞典」をコンプリートしてXにシェアした方から抽選で1名様にAmazonギフトカード3,000円分をプレゼント。応募規約・注意事項。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  robots: { index: false, follow: true },
};

const MENTION = "@mickey_fuku";
const HASHTAG = "#うちの子のことわざ辞典";
const PERIOD = "2026年7月18日(土) 18:00 〜 7月26日(日) 21:59";

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
        <span className="text-sm text-amber-600">{no}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}

export default async function KotowazaLotteryRulesPage() {
  await connection();

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      <p className="text-xs font-bold tracking-wide text-amber-600">
        CAMPAIGN
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-relaxed text-gray-900">
        うちの子のことわざ辞典
        <br />
        Xシェアキャンペーン 応募規約
      </h1>
      <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        「うちの子のことわざ辞典」をコンプリートし、対象のカードをXにシェアした方の中から、
        抽選で<span className="font-bold">1名様</span>に
        <span className="font-bold">Amazonギフトカード3,000円分</span>をプレゼントします。
      </p>

      <Section no="01" title="主催者">
        <p>
          本キャンペーンは、Persta.AI 運営者 土井秀悠（以下「主催者」といいます。）が主催します。
        </p>
        <p className="text-gray-500">
          ※ 本キャンペーンは、X Corp. および Amazon とは一切関係ありません。
        </p>
      </Section>

      <Section no="02" title="応募期間">
        <p>{PERIOD}（日本時間）</p>
        <p className="text-gray-500">
          ※ 応募期間中に投稿されたものを対象とします。期間外の投稿は対象外です。
        </p>
      </Section>

      <Section no="03" title="参加資格">
        <p>次のすべてを満たす方が応募できます。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>日本国内にお住まいの方</li>
          <li>18歳以上の方</li>
          <li>本規約およびXルールに同意いただける方</li>
          <li>Xアカウントを公開設定にしている方</li>
        </ul>
      </Section>

      <Section no="04" title="応募方法">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Persta.AI で「うちの子のことわざ辞典」の対象スタイルを生成し、コンプリート
            （6種）してコンプリートカードを完成させます。
          </li>
          <li>
            完成カードのページにある「Xで応募する」ボタンから、ハッシュタグ
            <span className="font-bold">{HASHTAG}</span> と主催者指定アカウント
            <span className="font-bold">{MENTION}</span> を付けてXに投稿します。
          </li>
        </ol>
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
          <span className="font-bold">参加に課金は不要です。</span>
          有料プランへの加入や課金の有無は、当選確率に一切影響しません。
        </p>
      </Section>

      <Section no="05" title="賞品">
        <p>Amazonギフトカード 3,000円分 を抽選で1名様。</p>
        <p className="text-gray-500">
          ※ Amazonギフトカードは Amazon.co.jp でのみご利用いただけます。有効期限・利用条件は
          Amazon の定めるところによります。
        </p>
      </Section>

      <Section no="06" title="抽選・当選発表">
        <p>
          応募期間終了後、応募条件を満たした投稿を対象に、主催者所定の方法により厳正に抽選のうえ、
          当選者を決定します。
        </p>
        <p>
          当選者には、主催者公式Xアカウントからのご連絡および主催者所定フォームへのご入力依頼をもって
          通知します。指定期限までにご入力がない場合、当選が無効となる場合があります。
        </p>
        <p className="text-gray-500">
          ※ 賞品の発送をもって当選発表に代えさせていただく場合があります。
        </p>
      </Section>

      <Section no="07" title="応募上限・無効となる場合">
        <ul className="list-disc space-y-1 pl-5">
          <li>応募は、お1人様1回（1アカウント）までとします。</li>
          <li>
            複数アカウントの利用、同一・類似内容の繰り返し投稿、非公開・削除された投稿、
            自動化ツール等による不正応募は無効とします。
          </li>
          <li>
            本規約・Xルール・法令への違反、虚偽情報、第三者の権利を侵害する投稿があった場合は、
            応募または当選を無効とします。
          </li>
        </ul>
      </Section>

      <Section no="08" title="投稿画像の取扱い">
        <p>
          応募者は、応募投稿および画像が第三者の権利を侵害しないことを保証するものとします。
        </p>
        <p>
          応募者は主催者に対し、当選発表・広報・SNS・Web掲載のために必要な範囲で、応募投稿および
          画像を無償・非独占的に利用する権利を許諾するものとします。
        </p>
      </Section>

      <Section no="09" title="個人情報の取扱い">
        <p>
          主催者は、応募確認・重複応募の排除・抽選・当選連絡・賞品送付・不正防止・お問い合わせ対応・
          法令遵守のために、Xアカウント名・投稿URL・当選連絡に必要なメールアドレス等を利用します。
        </p>
        <p>
          取得した個人情報は、法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。
          詳細は主催者プライバシーポリシーをご確認ください。
        </p>
      </Section>

      <Section no="10" title="税金の取扱い">
        <p>
          賞品の受領に伴い税務上の取扱いが生じる場合は、当選者ご自身の責任と負担において対応いただきます。
        </p>
      </Section>

      <Section no="11" title="変更・中止">
        <p>
          主催者は、法令またはプラットフォームのルール変更、システム障害その他やむを得ない事情により、
          本キャンペーンの内容を変更・中断・中止することがあります。
        </p>
      </Section>

      <Section no="12" title="準拠法">
        <p>本規約は日本法に準拠し、日本国内に居住する方を対象とします。</p>
      </Section>

      <div className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link
          href="/collections/kotowaza"
          className="font-bold text-amber-600 underline hover:text-amber-700"
        >
          ← 企画ページへ戻る
        </Link>
      </div>
    </main>
  );
}
