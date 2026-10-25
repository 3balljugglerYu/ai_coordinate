"use client";

import Link from "next/link";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";

/** 企画ページのエントリーの項目(#hbs-entry-top。企画ページの HashTargetScroll がそこへ移す) */
export const HOME_ENTRY_INVITE_HREF = `${HALLOWEEN_BEST_SHOT.path}#hbs-entry-top`;

/**
 * ホームの「ハロウィン企画」の棚の上に出す、まだエントリーしていない人への呼びかけ(2026-10-25 ユーザー指示)。
 *
 * - 出す相手: ログインしていて、まだエントリーしていない人(全員。対象作品を使ったかは問わない)
 * - 文はポジティブに「🎁 エントリーして、Amazonギフトカードを当てよう！」(ユーザー決定)。
 *   たまった数は出さない(ユーザー決定)
 * - **1行で出す(改行させない。ユーザー指示)。** 320px の幅でも収まるよう、文字の大きさを画面の幅に合わせて縮める(iPhone の書体でも余るよう、少し小さめ)
 * - 押せそうなボタンにする(ユーザー指示)。色はアプリの「生成する」ボタンと同じピンク→オレンジ。
 *   平らな面の下に濃い厚みを付け、押すと沈む(押せたことが分かる)。動きを減らす設定では動きを付けない
 * - 注記は添えない(ユーザー指示: この1行だけでよい)。押した先の企画ページに決まった注記2つがある
 * - 押すと企画ページのエントリーの項目へ
 *
 * 出すかどうか(期間中・ログイン中・まだエントリーしていない)は呼び出し側が決める。
 */
export function HomeHalloweenEntryInvite() {
  return (
    <div className="mx-4 mb-4 sm:mx-0" data-testid="home-halloween-entry-invite">
      <Link
        href={HOME_ENTRY_INVITE_HREF}
        onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.homeEntryInviteTap)}
        // 押せそうに見えるよう、平らな面の下に濃い色の厚み(4px)を付ける。押すと4px沈んで厚みが消える。
        // 2026-10-25 ユーザー決定: 今の主流を調べて3案(厚み+照り・厚みだけ・やわらかい影)を並べ「厚みだけ」(Duolingo 型)
        className="flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-3 text-[clamp(10px,3.2vw,15px)] font-bold text-white shadow-[0_4px_0_#b8336f] transition-[transform,box-shadow] duration-100 ease-out active:translate-y-[4px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2 motion-reduce:transition-none sm:inline-flex sm:w-auto sm:px-6"
      >
        🎁 エントリーして、Amazonギフトカードを当てよう！
      </Link>
    </div>
  );
}
