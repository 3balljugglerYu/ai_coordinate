/**
 * book(めくれる日記帳)完走の「シェア経由の登録」計測が3経路すべてで
 * 成立することを固定するテスト。
 *
 * レビュー(PR #521)で、mount 系は計測できるのに book 系
 * (= イタリア旅行・オーストラリア旅行)だけ流入元が NULL のままになる
 * 経路が3つ見つかったため、その再発防止として置く。
 *
 *   1. 直接着地   /m/<id>/book?signup_source=... に外部から着地
 *   2. リダイレクト /m/<id>?signup_source=... → /m/<id>/book
 *   3. 通常シェア  book 画面の「シェア」ボタンが出すURL
 *
 * 1 と 2 は実装が別ファイル(AppShell / page.tsx)にあるため、
 * ここでは「タグの持ち回りルール」を関数レベルで固定し、
 * 経路の接続は下記コメントの根拠をもって担保する。
 */

import { buildPublicBookUrl } from "@/features/collections/lib/share-mount";
import { parseSignupSource } from "@/features/auth/lib/signup-source";

const origin = window.location.origin;

describe("book シェアの流入元タグ", () => {
  test("通常シェア: completionId と categoryKey からタグ付きURLを作る", () => {
    // ScrapbookReader.handleShare が window.location.href をそのまま共有すると、
    // 所有者が内部導線から開いたタグ無しURLが出回って計測が落ちる。
    expect(buildPublicBookUrl("c1", "travel_to_australia")).toBe(
      `${origin}/m/c1/book?signup_source=travel_to_australia`,
    );
  });

  test("抽選なしの企画でもタグが付く(イタリア旅行)", () => {
    /*
      categoryKey は lottery prop からではなく独立して渡すこと。
      lottery は抽選対象カテゴリにしか入らないため、そこから取ると
      travel_to_italy のような抽選なしの book でタグが欠ける。
    */
    expect(buildPublicBookUrl("c1", "travel_to_italy")).toBe(
      `${origin}/m/c1/book?signup_source=travel_to_italy`,
    );
  });

  test("categoryKey が無ければタグを付けない(後方互換)", () => {
    expect(buildPublicBookUrl("c1")).toBe(`${origin}/m/c1/book`);
    expect(buildPublicBookUrl("c1", null)).toBe(`${origin}/m/c1/book`);
  });

  test("リダイレクトで引き継ぐ値は書式検証を通る(URLに不正値を載せない)", () => {
    /*
      /m/<id> → /m/<id>/book のリダイレクトはクエリを引き継ぐが、
      値はユーザー入力由来なので、そのまま cookie/DB へ流れる前に
      parseSignupSource(= DB の CHECK と同じ書式)で弾かれること。
    */
    expect(parseSignupSource("travel_to_australia")).toBe("travel_to_australia");
    expect(parseSignupSource("Travel To AU")).toBeNull();
    expect(parseSignupSource("a".repeat(41))).toBeNull();
    expect(parseSignupSource("<script>")).toBeNull();
  });
});
