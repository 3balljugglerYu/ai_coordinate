export const MS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 24 * 60 * 60;
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;

/** カウントダウンを「時間+分+秒」表示に切り替える残り時間のしきい値(24時間)。 */
export const EVENT_COUNTDOWN_HOURS_THRESHOLD_MS = MS_PER_DAY;

export type EventShelfCountdown =
  | { type: "days"; days: number }
  | { type: "countdown"; hours: number; minutes: number; seconds: number };

/**
 * 企画棚のカウントダウン表示を導出する純関数。
 *
 * - 残り 24 時間以上: 「あと{days}日」(日数は切り上げ)
 * - 残り 24 時間未満: 「あと{hours}時間{minutes}分{seconds}秒」(秒は切り上げ。
 *   終了前に 0 秒と表示されることはなく、終了時刻ちょうどに 0 になる)
 * - 終了後(残りが負)・endsAt 無し・不正な日時: null(バッジ非表示)
 *
 * 秒の切り上げにより残りがちょうど 24 時間(=86400秒)になる瞬間は、
 * 「あと24時間0分0秒」ではなく日数表示側に倒す。
 */
export function deriveEventShelfCountdown(
  endsAtIso: string | null,
  nowMs: number,
): EventShelfCountdown | null {
  if (!endsAtIso) {
    return null;
  }
  const endsAtMs = Date.parse(endsAtIso);
  if (Number.isNaN(endsAtMs)) {
    return null;
  }
  const msLeft = endsAtMs - nowMs;
  if (msLeft < 0) {
    return null;
  }
  if (msLeft >= EVENT_COUNTDOWN_HOURS_THRESHOLD_MS) {
    return { type: "days", days: Math.ceil(msLeft / MS_PER_DAY) };
  }
  const totalSeconds = Math.ceil(msLeft / MS_PER_SECOND);
  if (totalSeconds >= SECONDS_PER_DAY) {
    return { type: "days", days: 1 };
  }
  return {
    type: "countdown",
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
