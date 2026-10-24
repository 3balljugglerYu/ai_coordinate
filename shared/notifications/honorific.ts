/**
 * 通知に出す相手の名前に「さん」を付ける(2026-10-24 ユーザー決定)。
 * 名前の側にもう敬称(さん・様・ちゃん・くん など)が付いていれば重ねない。
 *
 * 日本語の表示だけで使う。プッシュ(send-push)と Web のお知らせ一覧が同じ決まりを使う
 * (アプリは persta-app の notification_presentation.dart に同じ決まりを書き写してある)。
 */
export function withHonorific(name: string): string {
  const trimmed = name.trim();
  return /(さん|さま|様|ちゃん|くん|氏|殿)$/u.test(trimmed) ? trimmed : `${trimmed}さん`;
}
