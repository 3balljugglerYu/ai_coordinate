import Link from "next/link";
import { HALLOWEEN_BEST_SHOT as CAMPAIGN } from "../halloween-best-shot";

/**
 * Amazonギフトカードを賞品にするときに、告知物へ必ず入れる注記2つ
 * (2026-10-16 ユーザー提供の「Amazonギフトカード プレゼントキャンペーン注意事項」)。
 *
 * 文は注意事項の決まった文のとおりにし、主催者名(Persta.AI)と連絡先だけを埋める。
 * 連絡先はお問い合わせフォーム(2026-10-16 ユーザー決定)。企画ページと応募規約で同じものを出す。
 */
export function AmazonGiftCardNotice({
  className,
  linkClassName,
}: {
  className?: string;
  linkClassName?: string;
}) {
  return (
    <div className={className} data-testid="amazon-gift-card-notice">
      <p>
        本キャンペーンはPersta.AIによる提供です。本キャンペーンについてのお問い合わせはAmazonではお受けしておりません。Persta.AIキャンペーン事務局（
        <Link href={CAMPAIGN.contactHref} className={linkClassName}>
          お問い合わせフォーム
        </Link>
        ）までお願いいたします。
      </p>
      <p>Amazon、Amazon.co.jpおよびそれらのロゴはAmazon.com, Inc.またはその関連会社の商標です。</p>
    </div>
  );
}
