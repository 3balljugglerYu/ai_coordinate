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
  /** 応募規約ページのパス。 */
  rulesPath: string;
}

/** 現行キャンペーン(Amazonギフト3,000円)の文面。 */
export const X_LOTTERY_COPY: XLotteryCopy = {
  hashtags: ["うちの子のことわざ辞典"],
  mention: "mickey_fuku",
  message: "うちの子のことわざ辞典をコンプリートしました！",
  prizeLabel: "Amazonギフトカード3,000円分",
  rulesPath: "/campaigns/kotowaza-lottery",
};

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
 * text にメッセージ + 主催者メンション、hashtags にタグ、url に台紙シェアURLを渡す。
 * → 投稿に「メッセージ + @メンション + OGPカード + #ハッシュタグ」が入り、
 *   Xガイドラインの「主催者@ユーザー名を含める」を満たしつつ応募回収できる。
 */
export function buildXLotteryIntentUrl(
  copy: XLotteryCopy,
  shareUrl: string,
): string {
  const params = new URLSearchParams();
  params.set("text", `${copy.message} @${copy.mention}`);
  params.set("url", shareUrl);
  if (copy.hashtags.length > 0) {
    params.set("hashtags", copy.hashtags.join(","));
  }
  return `https://x.com/intent/post?${params.toString()}`;
}
