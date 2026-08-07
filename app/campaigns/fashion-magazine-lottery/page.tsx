import type { Metadata } from "next";
import Link from "next/link";

const PAGE_TITLE =
  "うちの子のファッション雑誌：夏 Xシェアキャンペーン 応募規約 | Persta.AI";
const PAGE_DESCRIPTION =
  "「うちの子のファッション雑誌：夏」を1冊完成させてXにシェアした方から抽選で5名様にAmazonギフト券2,000円分をプレゼント。応募規約・注意事項。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  robots: { index: false, follow: true },
};

const MENTION = "@mickey_fuku";
const HASHTAG = "#うちの子のファッション雑誌";
const PERIOD = "2026年8月8日(土) 19:00 〜 8月16日(日) 21:59";

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
        <span className="text-sm text-orange-700">{no}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}

export default function FashionMagazineLotteryRulesPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
      <p className="text-xs font-bold tracking-wide text-orange-700">CAMPAIGN</p>
      <h1 className="mt-1 text-2xl font-bold leading-relaxed text-gray-900">
        うちの子のファッション雑誌：夏
        <br />
        Xシェアキャンペーン 応募規約
      </h1>
      <p className="mt-3 rounded-xl bg-orange-50 px-4 py-3 text-sm font-medium text-orange-900">
        「うちの子のファッション雑誌：夏」の全8ページを完成させ、できあがった雑誌をXにシェアした方の中から、
        抽選で<span className="font-bold">5名様</span>に
        <span className="font-bold">Amazonギフト券2,000円分</span>をお贈りします。
      </p>

      <Section no="01" title="主催者">
        <p>
          本キャンペーンは Persta.AI の運営者（以下「主催者」）が実施します。
          応募の受付・抽選・当選連絡・賞品の送付は、いずれも主催者のXアカウント（{MENTION}）を通じて行います。
        </p>
        <p>
          本キャンペーンは X Corp.
          が主催・共催・後援するものではなく、Xおよび同社とは一切関係ありません。
        </p>
      </Section>

      <Section no="02" title="応募期間">
        <p>{PERIOD}（日本時間）</p>
        <p>
          期間内に、後述の応募手順がすべて完了している必要があります。締切後の投稿・フォローは応募として扱われません。
        </p>
      </Section>

      <Section no="03" title="参加資格">
        <ul className="list-disc space-y-1 pl-5">
          <li>日本国内にお住まいの方（賞品が日本のAmazonでのみ利用できるギフト券のため）</li>
          <li>18歳以上の方</li>
          <li>
            Xの<span className="font-bold">公開アカウント</span>
            をお持ちの方（非公開アカウントからの投稿は抽選対象を確認できないため、応募になりません）
          </li>
        </ul>
      </Section>

      <Section no="04" title="応募方法">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Persta.AI
            の「うちの子のファッション雑誌：夏」で、表紙から裏表紙まで全8ページを生成し、1冊を完成させる
          </li>
          <li>
            完成ページに表示される「Xで応募する」ボタンから、雑誌をXへ
            <span className="font-bold">公開ポスト</span>する。ポストには{" "}
            <span className="font-bold">{MENTION} へのメンション</span>と{" "}
            <span className="font-bold">{HASHTAG}</span>{" "}
            の両方が含まれている必要があります（ボタンから投稿すると自動で入ります。編集して外れた場合は対象外となるためご注意ください）
          </li>
          <li>
            Xで {MENTION} をフォローする —
            当選のご連絡をXのダイレクトメッセージ（DM）でお送りするためです。フォローいただいていないと、DMを受け取れない設定によりご連絡できない場合があります
          </li>
        </ol>
        <p className="text-gray-500">
          手順2・3の順番は前後しても構いません。抽選日時点で3つすべてを満たしている方が対象です。
        </p>
      </Section>

      <Section no="05" title="賞品">
        <p>
          Amazonギフト券 2,000円分 × 5名様
          <br />
          （Eメールタイプ等のコードを、当選連絡のDMにてお送りします）
        </p>
      </Section>

      <Section no="06" title="抽選・当選発表">
        <ul className="list-disc space-y-1 pl-5">
          <li>応募期間の終了後、条件を満たした応募の中から主催者が抽選します</li>
          <li>
            当選された方には、{MENTION} からXのDMでご連絡します。当選発表はこのDMをもって代えさせていただきます
          </li>
          <li>
            DMのご連絡から7日以内にお返事がない場合、当選を無効とし、繰り上げ抽選を行うことがあります
          </li>
          <li>抽選の経過・結果に関する個別のお問い合わせにはお答えできません</li>
        </ul>
      </Section>

      <Section no="07" title="応募にあたっての注意事項">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-bold">応募は無料です。</span>
            ペルコインを購入したかどうかは、当選確率に一切影響しません（無料で獲得できるペルコインだけでもコンプリートに到達できます）
          </li>
          <li>応募はおひとり1アカウントまでです。複数アカウントからの応募が確認された場合、すべて対象外となります</li>
          <li>1回のコンプリートにつき1口の応募として扱います</li>
          <li>
            次のいずれかに当てはまる場合、応募は無効となります：非公開アカウントからの投稿／メンションまたはハッシュタグの欠落／抽選日までに応募ポストが削除・非公開化されている／その他、不正な手段によると主催者が判断した応募
          </li>
          <li>賞品の換金・返品・第三者への譲渡はできません</li>
          <li>
            本キャンペーンは、予告なく内容の変更・中断・終了を行う場合があります
          </li>
          <li>
            応募に伴う通信費等は応募者のご負担となります
          </li>
          <li>
            ご応募いただいたポストは、Persta.AI
            の公式アカウント・サービス内でご紹介させていただく場合があります
          </li>
        </ul>
      </Section>

      <div className="mt-10 border-t border-gray-200 pt-6 text-sm">
        <Link
          href="/collections/fashion-magazine"
          className="text-orange-700 underline hover:text-orange-800"
        >
          ← 企画ページへもどる
        </Link>
      </div>
    </main>
  );
}
