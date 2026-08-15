/**
 * Xシェア抽選キャンペーンの応募動線に関する定義。
 *
 * 「どのカテゴリが対象か・受付期間」は admin 設定(preset_categories.lottery_target と
 * collection_display 期間)で決まる。ボタンの文面(ハッシュタグ・メンション・賞品名・
 * 規約リンク)は、現行の単一キャンペーン(Amazonギフト)ぶんをこのコード定数で持つ。
 *
 * 法務方針(オープン懸賞に倒す):
 * - 参加無料・課金は当選確率に影響しない(規約 /campaigns/... に明記)
 * - 応募=公開アカウントから、指定ハッシュタグ + 主催者メンション付き投稿
 * - 1コンプリートごとに1応募(口数=コレクション巻数で有限・全て無料到達可能)。1人1アカウント
 * - 日本国内・18歳以上限定
 */
export interface XLotteryCopy {
  /** 応募ポストに付けるハッシュタグ(先頭の # は付けない)。 */
  hashtags: readonly string[];
  /** 主催者メンション先(先頭の @ は付けない)。応募回収のため必須。 */
  mention: string;
  /** 応募ポストの定型メッセージ。 */
  message: string;
  /** 賞品名(UI表示用)。 */
  prizeLabel: string;
  /** 当選人数の表示(「1名様」「5名様」)。ボタンの誘導文で使う。 */
  winnersLabel: string;
  /** 応募規約ページのパス。 */
  rulesPath: string;
  /**
   * 投稿画面でユーザーが手動で行う必要がある作業の注記(応募ボタン直下に表示)。
   * intent で自動入力できないもの(例: 画像添付が応募要件のキャンペーン)に使う。
   */
  attachmentNote?: string;
}

/**
 * カテゴリ key → キャンペーン文面。
 *
 * 「どのカテゴリで受付中か・期間」は admin(lottery_target + 表示期間)が決め、
 * 文面はここで対になる。マップに無いカテゴリは lottery_target が立っていても
 * ボタンを出さない(文面が無い応募動線を作らない fail-closed)。
 * 終了したキャンペーンの文面も履歴・復刻用に残す。
 */
export const X_LOTTERY_CAMPAIGNS: Readonly<Record<string, XLotteryCopy>> = {
  // ことわざ辞典(2026-07-18〜07-26・受付終了)
  kotowaza_dictionary: {
    hashtags: ["うちの子のことわざ辞典"],
    mention: "mickey_fuku",
    message: "うちの子のことわざ辞典をコンプリートしました！",
    prizeLabel: "Amazonギフトカード3,000円分",
    winnersLabel: "1名様",
    rulesPath: "/campaigns/kotowaza-lottery",
  },
  kotowaza_dictionary_2: {
    hashtags: ["うちの子のことわざ辞典"],
    mention: "mickey_fuku",
    message: "うちの子のことわざ辞典をコンプリートしました！",
    prizeLabel: "Amazonギフトカード3,000円分",
    winnersLabel: "1名様",
    rulesPath: "/campaigns/kotowaza-lottery",
  },
  // うちの子のファッション雑誌：夏(2026-08-08 19:00〜08-16 21:59)
  fashion_magazine_summer: {
    hashtags: ["うちの子のファッション雑誌", "PerstaAI"],
    mention: "mickey_fuku",
    message: "うちの子のファッション雑誌、完成しました！",
    prizeLabel: "Amazonギフト券2,000円分",
    winnersLabel: "5名様",
    rulesPath: "/campaigns/fashion-magazine-lottery",
    attachmentNote:
      "投稿画面で、この企画で生成したイラストを1枚以上添付してください(応募条件)",
  },
  // うちの子のオーストラリア旅行(2026-08-22 08:00〜08-30 21:59)
  travel_to_australia: {
    hashtags: ["うちの子のオーストラリア旅行", "PerstaAI"],
    mention: "mickey_fuku",
    message: "うちの子のオーストラリア旅行、完成しました！",
    prizeLabel: "Amazonギフト券2,000円分",
    winnersLabel: "5名様",
    rulesPath: "/campaigns/australia-lottery",
    attachmentNote:
      "投稿画面で、この企画で生成したイラストを1枚以上添付してください(応募条件)",
  },
};

/** カテゴリの文面を引く。未定義なら null(ボタン非表示)。 */
export function getXLotteryCopy(categoryKey: string): XLotteryCopy | null {
  return X_LOTTERY_CAMPAIGNS[categoryKey] ?? null;
}

/**
 * このカテゴリの完走台紙で応募を受け付けているか。
 * admin の対象フラグ(lotteryTarget) かつ 受付期間内(= 企画表示期間を流用)。
 * starts/ends が null の側は無制限として扱う(開始時刻ちょうどは受付、終了時刻を過ぎたら締切)。
 */
export function isLotteryEntryOpen(
  lotteryTarget: boolean,
  startsAt: string | null,
  endsAt: string | null,
  now: Date,
): boolean {
  if (!lotteryTarget) return false;
  const t = now.getTime();
  if (startsAt && t < new Date(startsAt).getTime()) return false;
  if (endsAt && t > new Date(endsAt).getTime()) return false;
  return true;
}

/**
 * 応募用の X intent(post) URL を組み立てる。
 *
 * url / hashtags パラメータを使うと本文が1行に連結されて読みにくいため、
 * 改行込みのレイアウトを text 1パラメータにまとめて渡す:
 *
 *   {メッセージ}
 *   {シェアURL}
 *   (空行)
 *   @{メンション}
 *   #{タグ} #{タグ}
 *
 * OGPカードは本文中のURLから展開される。@メンションと#タグが本文に入るので
 * Xガイドラインの「主催者@ユーザー名を含める」も満たしつつ応募回収できる。
 *
 * エンドポイントはレガシーの twitter.com/intent/tweet を使う。
 * x.com/intent/post だと iOS の X アプリがネイティブ投稿画面に割り当てず
 * アプリ内ブラウザ(Web版投稿画面)で開いてしまい、Web版に未ログインの
 * ユーザーはログイン壁で応募できない(実機検証 2026-08-08)。
 * twitter.com/intent/tweet はアプリのネイティブ投稿画面へマップされ、
 * アプリ未インストール時は x.com の Web 投稿画面へリダイレクトされる。
 */
export function buildXLotteryIntentUrl(
  copy: XLotteryCopy,
  shareUrl: string,
): string {
  const lines = [copy.message, shareUrl, "", `@${copy.mention}`];
  if (copy.hashtags.length > 0) {
    lines.push(copy.hashtags.map((tag) => `#${tag}`).join(" "));
  }
  const params = new URLSearchParams();
  params.set("text", lines.join("\n"));
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}
