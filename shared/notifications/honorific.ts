/**
 * 通知に出す相手の名前に「さん」を付ける(2026-10-24 ユーザー決定)。
 *
 * 日本語の表示だけで使う。プッシュ(send-push)と Web のお知らせ一覧が同じ決まりを使う
 * (アプリは persta-app の notification_presentation.dart に同じ決まりを書き写してある)。
 */

// もう付いている敬称。うしろに絵文字・記号・空白が続いていても(「みきちゃん🐣」「田中さん。」)付いているとみなす。
// ⚠️「たくさん」のように、名前の一部がたまたま敬称と同じ字で終わる人には付かない(見分けられないため)
const HONORIFIC_SUFFIX =
  /(さん|さま|様|ちゃん|くん|君|たん|氏|殿|先生|サン|サマ|チャン|クン)[\p{P}\p{S}\p{M}\p{Extended_Pictographic}‍\s]*$/u;

/** 名前に「さん」を付ける。名前の側にもう敬称が付いていれば重ねない */
export function withHonorific(name: string): string {
  const trimmed = name.trim();
  return HONORIFIC_SUFFIX.test(trimmed) ? trimmed : `${trimmed}さん`;
}

/**
 * 「〇〇があなた…」の形の題名(DB に記録した文)の名前に「さん」を付ける。形が違えば null。
 * 名前との切れ目は最後の「があなた」(定型文の側には「があなた」が無いので、名前に入っていても切れる)
 */
export function withHonorificInActorTitle(title: string | null | undefined): string | null {
  const match = /^(.+)が(あなた.+)$/u.exec(title?.trim() ?? "");
  if (!match) return null;
  return `${withHonorific(match[1])}が${match[2]}`;
}
