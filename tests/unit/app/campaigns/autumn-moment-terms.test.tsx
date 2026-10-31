/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import AutumnMomentTermsPage, { metadata } from "@/app/campaigns/autumn-moment/terms/page";

/** 見出し(h2)の下の中身。見出しの番号と題名で探す */
function section(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: new RegExp(title) });
  const container = heading.closest("section");
  if (!container) throw new Error(`section not found: ${title}`);
  return container;
}

describe("秋のひととき企画の応募規約(2026-10-30 ユーザー決定)", () => {
  test("検索には出さない(検索に出すのは企画ページだけ)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  test("見出しは12条を、この順で出す(ハロウィンと同じ形)", () => {
    render(<AutumnMomentTermsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("応募規約");
    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent)).toEqual([
      "01主催者",
      "02応募期間・生成期間",
      "03参加資格",
      "04応募方法・生成",
      "05賞品",
      "06選考・当選のご連絡",
      "07応募・当選が無効となる場合",
      "08作品の取扱い",
      "09個人情報の取扱い",
      "10税金の取扱い",
      "11変更・中止",
      "12準拠法",
    ]);
  });

  test("期間は応募と生成の2つを、年と日本時間つきで書く", () => {
    render(<AutumnMomentTermsPage />);
    const text = section("応募期間・生成期間").textContent ?? "";
    expect(text).toContain("応募期間：2026年11月1日(日) 0:00 〜 11月15日(日) 23:59（日本時間）");
    expect(text).toContain("生成期間：2026年11月16日(月) 0:00 〜 11月22日(日) 23:59（日本時間）");
  });

  test("参加は18歳以上。Amazonギフトカードは日本国内の方だけ、ペルコインは海外の方も対象", () => {
    render(<AutumnMomentTermsPage />);
    const text = section("参加資格").textContent ?? "";
    expect(text).toContain("18歳以上の方");
    expect(text).toContain("Amazonギフトカードの賞（秋のひととき大賞）は、日本国内にお住まいの方が対象です。");
    expect(text).toContain("ペルコインの賞（すてきなひととき賞）は、海外にお住まいの方も対象です。");
    // 準拠法の条から「日本国内にお住まいの方を対象」を外した(ペルコインは海外の方も受け取れるため)
    expect(section("準拠法").textContent).not.toContain("日本国内にお住まいの方を対象");
  });

  test("生成: 応募期間中から生成期間の終わりまで生成できる。購入は不要", () => {
    render(<AutumnMomentTermsPage />);
    const text = section("応募方法・生成").textContent ?? "";
    expect(text).toContain("応募期間中から、生成期間の終わり（11/22(日) 23:59）まで、いつでも生成できます。");
    // 購入を条件にしない(オープン懸賞)
    expect(text).toContain("参加にペルコインの購入は不要です。");
    expect(text).toContain("購入の有無は、選考に一切影響しません。");
  });

  test("⭐選考は主催者が、11/1〜11/22 の生成数・いいね・コメントなどを総合して決める(2026-10-31 ユーザー決定)", () => {
    render(<AutumnMomentTermsPage />);
    const text = section("選考・当選のご連絡").textContent ?? "";
    expect(text).toContain("受賞作品は、主催者が選考して決めます。");
    expect(text).toContain("（2026年11月1日〜11月22日）の、各応募作品の生成数・いいね・コメントなどを総合して判断します。");
    expect(text).toContain("秋のひととき大賞（1名様）は、日本国内にお住まいの方の応募作品から選びます。");
    expect(text).toContain("生成数には、作品を投稿した本人の生成と、主催者および本キャンペーンの関係者の生成は含めません。");
    expect(section("賞品").textContent).toContain("賞は、1人1つまでです。");
  });

  test("⭐「投票」「票」「使われた回数の多い順」とは書かない(2026-10-31 ユーザー指示)", () => {
    render(<AutumnMomentTermsPage />);
    const text = document.body.textContent ?? "";
    for (const ng of ["投票", "票", "使われた", "多い順", "いちばん多く"]) {
      expect(text).not.toContain(ng);
    }
  });

  test("Amazonギフトカードの決まった注記2つを出す", () => {
    render(<AutumnMomentTermsPage />);
    const notice = screen.getByTestId("amazon-gift-card-notice").textContent ?? "";
    expect(notice).toContain("本キャンペーンについてのお問い合わせはAmazonではお受けしておりません。");
    expect(notice).toContain("Amazon、Amazon.co.jpおよびそれらのロゴはAmazon.com, Inc.またはその関連会社の商標です。");
  });
});
