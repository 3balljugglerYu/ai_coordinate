/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import KimePoseTermsPage, { metadata } from "@/app/campaigns/kime-pose/terms/page";

/** 見出し(h2)の下の中身。見出しの番号と題名で探す */
function section(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: new RegExp(title) });
  const container = heading.closest("section");
  if (!container) throw new Error(`section not found: ${title}`);
  return container;
}

describe("決めポーズ企画の応募規約(2026-10-30 ユーザー決定)", () => {
  test("検索には出さない(検索に出すのは企画ページだけ)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  test("見出しは12条を、この順で出す(ハロウィンと同じ形)", () => {
    render(<KimePoseTermsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("応募規約");
    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent)).toEqual([
      "01主催者",
      "02応募期間・投票期間",
      "03参加資格",
      "04応募方法・投票",
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

  test("期間は応募と投票の2つを、年と日本時間つきで書く", () => {
    render(<KimePoseTermsPage />);
    const text = section("応募期間・投票期間").textContent ?? "";
    expect(text).toContain("応募期間：2026年11月1日(日) 0:00 〜 11月15日(日) 23:59（日本時間）");
    expect(text).toContain("投票期間：2026年11月16日(月) 0:00 〜 11月22日(日) 23:59（日本時間）");
  });

  test("参加は18歳以上。Amazonギフトカードは日本国内の方だけ、ペルコインは海外の方も対象", () => {
    render(<KimePoseTermsPage />);
    const text = section("参加資格").textContent ?? "";
    expect(text).toContain("18歳以上の方");
    expect(text).toContain("Amazonギフトカードの賞（ベスト決めポーズ賞）は、日本国内にお住まいの方が対象です。");
    expect(text).toContain("ペルコインの賞（ナイス決めポーズ賞）は、海外にお住まいの方も対象です。");
    // 準拠法の条から「日本国内にお住まいの方を対象」を外した(ペルコインは海外の方も受け取れるため)
    expect(section("準拠法").textContent).not.toContain("日本国内にお住まいの方を対象");
  });

  test("投票の数え方: 応募期間中の生成も含め、本人・コピー貼り付け・主催者の生成は数えない", () => {
    render(<KimePoseTermsPage />);
    const text = section("応募方法・投票").textContent ?? "";
    expect(text).toContain("1回の生成でその応募作品に1票が入ります");
    expect(text).toContain("応募期間中の生成も、票に数えます。");
    expect(text).toContain("自分の応募作品で生成したものは数えません。");
    expect(text).toContain("プロンプトをコピーして貼り付けた生成は数えません。");
    expect(text).toContain("主催者および本キャンペーンの関係者の生成は数えません。");
    // 購入を条件にしない(オープン懸賞)
    expect(text).toContain("参加にペルコインの購入は不要です。");
  });

  test("選考は回数の多い順。Amazonギフトカードは日本国内の方のうち1位、同じ回数は先に投稿した作品が上、賞は1人1つ", () => {
    render(<KimePoseTermsPage />);
    const text = section("選考・当選のご連絡").textContent ?? "";
    expect(text).toContain("多い順に受賞作品を決めます");
    expect(text).toContain("日本国内にお住まいの方の応募作品のうち、いちばん多く生成された作品の方（1名様）");
    expect(text).toContain("同じ回数のときは、先に投稿された作品を上とします。");
    expect(section("賞品").textContent).toContain("賞は、1人1つまでです。");
  });

  test("Amazonギフトカードの決まった注記2つを出す", () => {
    render(<KimePoseTermsPage />);
    const notice = screen.getByTestId("amazon-gift-card-notice").textContent ?? "";
    expect(notice).toContain("本キャンペーンについてのお問い合わせはAmazonではお受けしておりません。");
    expect(notice).toContain("Amazon、Amazon.co.jpおよびそれらのロゴはAmazon.com, Inc.またはその関連会社の商標です。");
  });
});
