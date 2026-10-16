/**
 * @jest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import HalloweenBestShotTermsPage, { metadata } from "@/app/campaigns/halloween-best-shot/terms/page";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";

/** 見出し(h2)の下の中身。見出しの番号と題名で探す */
function section(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: new RegExp(title) });
  const container = heading.closest("section");
  if (!container) throw new Error(`section not found: ${title}`);
  return container;
}

describe("ハロウィン企画の応募規約(2026-10-16 ユーザー決定: 日本国内の18歳以上・お問い合わせはフォーム)", () => {
  test("検索には出さない(企画ページと同じ)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  test("見出しは12条を、この順で出す", () => {
    render(<HalloweenBestShotTermsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("応募規約");
    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent)).toEqual([
      "01主催者",
      "02応募期間",
      "03参加資格",
      "04応募方法",
      "05賞品",
      "06審査・抽選・当選のご連絡",
      "07応募・当選が無効となる場合",
      "08作品の取扱い",
      "09個人情報の取扱い",
      "10税金の取扱い",
      "11変更・中止",
      "12準拠法",
    ]);
  });

  test("主催者: 氏名と連絡先は特定商取引法に基づく表記へ", () => {
    render(<HalloweenBestShotTermsPage />);
    const organizer = section("主催者");
    expect(organizer.textContent).toContain("Persta.AI 運営者");
    expect(within(organizer).getByRole("link", { name: "特定商取引法に基づく表記" }).getAttribute("href")).toBe(
      "/tokushoho",
    );
  });

  test("応募期間は年と日本時間つき", () => {
    render(<HalloweenBestShotTermsPage />);
    expect(section("応募期間").textContent).toContain("2026年10月16日(金) 20:00 〜 10月31日(土) 23:59（日本時間）");
  });

  test("参加資格: 日本国内にお住まいの方・18歳以上・Amazon.co.jp のアカウントが要ること", () => {
    render(<HalloweenBestShotTermsPage />);
    const eligibility = section("参加資格");
    const items = Array.from(eligibility.querySelectorAll("li")).map((node) => node.textContent);
    expect(items).toEqual(expect.arrayContaining(["日本国内にお住まいの方", "18歳以上の方"]));
    expect(eligibility.textContent).toContain("Amazon.co.jpのアカウントが必要です");
  });

  test("応募方法: 2部門の参加のしかたと、ペルコインの購入は不要で結果に影響しないこと", () => {
    render(<HalloweenBestShotTermsPage />);
    const howTo = section("応募方法");
    expect(howTo.textContent).toContain(HALLOWEEN_BEST_SHOT.prizeCategories.creative.name);
    expect(howTo.textContent).toContain(HALLOWEEN_BEST_SHOT.prizeCategories.enjoy.name);
    expect(howTo.textContent).toContain(HALLOWEEN_BEST_SHOT.hashtag);
    expect(howTo.textContent).toContain("3作品で1口、6作品で2口、10作品で3口");
    expect(howTo.textContent).toContain(
      "参加にペルコインの購入は不要です。購入の有無は、審査・抽選の結果に一切影響しません。",
    );
  });

  test("賞品: 企画ページと同じ設定から、7つの賞の名前・賞品・人数を出す", () => {
    render(<HalloweenBestShotTermsPage />);
    const prizes = section("賞品");
    for (const prize of [...HALLOWEEN_BEST_SHOT.prizes, ...HALLOWEEN_BEST_SHOT.userPrizes]) {
      expect(prizes.textContent).toContain(
        `${prize.name}（${prize.winners}）: ${prize.gift} ${prize.amount}${prize.unit}`,
      );
    }
    expect(prizes.textContent).toContain("Amazonギフトカードは、Amazon.co.jpでのみご利用いただけます");
  });

  test("企画ページの賞品の下から外した注意(10/16)は、すべてここに書いてある", () => {
    render(<HalloweenBestShotTermsPage />);
    const text = document.body.textContent ?? "";
    for (const note of [
      "日本国内にお住まいの方",
      "18歳以上の方",
      "参加にペルコインの購入は不要です。",
      "Amazonギフトカードは、Amazon.co.jpでのみご利用いただけます",
      "ペルコインには有効期限があります",
      "クリエイティブ部門とエンジョイ部門の、両方には当選しません",
      "抽選はエントリーした方が対象です",
      "1人1アカウント",
      "不正な方法で参加した場合",
    ]) {
      expect(text).toContain(note);
    }
  });

  test("当選のご連絡は Persta.AI 内のお知らせでのみ、個別に。Amazonギフトカードは、フォームで受け取り先を登録してもらいメールで送る(公開の場では送らない)", () => {
    render(<HalloweenBestShotTermsPage />);
    const notice = section("審査・抽選・当選のご連絡");
    expect(notice.textContent).toContain("当選者には、Persta.AI 内のお知らせでのみ、個別にご連絡します。");
    expect(notice.textContent).not.toContain("主催者所定の方法で個別にご連絡します");
    expect(notice.textContent).toContain(
      "Amazonギフトカードは、お知らせに記載のフォームで受け取り用のメールアドレスをご登録いただき、メールでお送りします",
    );
    expect(notice.textContent).toContain("公開の場ではお送りしません");
  });

  test("いちばん下に、Amazon の決まった注記2つとお問い合わせフォーム。企画ページへ戻るリンク", () => {
    render(<HalloweenBestShotTermsPage />);
    const notice = screen.getByTestId("amazon-gift-card-notice");
    expect(notice.textContent).toContain("本キャンペーンについてのお問い合わせはAmazonではお受けしておりません。");
    expect(notice.textContent).toContain(
      "Amazon、Amazon.co.jpおよびそれらのロゴはAmazon.com, Inc.またはその関連会社の商標です。",
    );
    expect(within(notice).getByRole("link", { name: "お問い合わせフォーム" }).getAttribute("href")).toBe(
      "/my-page/contact",
    );
    expect(screen.getByRole("link", { name: /企画ページへ戻る/ }).getAttribute("href")).toBe(
      HALLOWEEN_BEST_SHOT.path,
    );
  });

  test("略称や、全員もらえるように読める言い方を使わない", () => {
    render(<HalloweenBestShotTermsPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("アマギフ");
    expect(text).not.toContain("ギフト券");
    expect(text).not.toMatch(/GET|ゲット/);
  });
});
