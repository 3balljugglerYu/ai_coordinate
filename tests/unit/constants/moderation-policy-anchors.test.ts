/** @jest-environment node */

/**
 * 執行ポリシーのアンカーが、コミュニティガイドラインの実在セクションを指すことの検証。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md ADR-003
 *
 * 判定詳細ページの「該当条項を読む」は `/community-guidelines#<anchor>` へ飛ぶ。
 * カタログにアンカーを足したのにガイドライン側のセクションを足し忘れると、
 * リンクがページ先頭に着地して黙って壊れる。型では片側しか守れないためここで突き合わせる。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MODERATION_POLICY_ANCHORS,
  MODERATION_POLICY_CATALOG,
} from "@/constants/moderation-policy";

const GUIDELINES_PAGE = path.join(
  process.cwd(),
  "app/(marketing)/community-guidelines/page.tsx"
);

describe("執行ポリシーのアンカー整合", () => {
  const source = readFileSync(GUIDELINES_PAGE, "utf-8");

  it.each(MODERATION_POLICY_ANCHORS)(
    "%s に対応するセクションがガイドラインに存在する",
    (anchor) => {
      expect(source).toContain(`anchor: "${anchor}"`);
    }
  );

  it("カタログが使うアンカーは既知の一覧に含まれる", () => {
    const used = new Set(MODERATION_POLICY_CATALOG.map((policy) => policy.anchor));
    for (const anchor of used) {
      expect(MODERATION_POLICY_ANCHORS).toContain(anchor);
    }
  });

  it("Card に id としてアンカーが出力されている", () => {
    // これが外れるとアンカー自体が DOM に出ず、全リンクが機能しなくなる
    expect(source).toContain("id={section.anchor}");
  });

  it("異議申立てセクションのアンカーも用意されている", () => {
    // 判定詳細ページからの案内先として使うため
    expect(source).toContain('anchor: "guidelines-appeal"');
  });
});
