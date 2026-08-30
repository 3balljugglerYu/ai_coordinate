/**
 * 付与額の「予約」の共有ロジック。
 *
 * 予約は「この日時になったら、この額に切り替える」という 1 行 1 件の情報。
 * **切替は DB の読み取り時に判定される**（cron で書き換えない）ので、
 * ここでの計算は画面表示と保存前の検証のためにある。
 *
 * DB 側の判定と食い違うと「画面では切替済みなのに実際は旧額」という
 * 一番たちの悪いズレになるため、判定式は 1 つに揃えること:
 *   予約日時が現在時刻以下 → 予約額が有効
 */

export interface PercoinSchedule {
  /** 予約額。null なら予約なし */
  scheduledAmount: number | null;
  /** 切替日時(ISO)。null なら予約なし */
  scheduledAt: string | null;
}

export type ScheduleState =
  /** 予約なし */
  | { kind: "none" }
  /** 予約済みで、まだ切り替わっていない */
  | { kind: "pending"; amount: number; at: Date }
  /** 予約日時を過ぎ、予約額が有効になっている */
  | { kind: "applied"; amount: number; at: Date };

/**
 * 予約の状態を判定する。
 *
 * @param now 判定の基準時刻。呼び出し側から渡すことで、テストと
 *   サーバー/クライアントの時刻ズレを扱いやすくする
 */
export function resolveScheduleState(
  schedule: PercoinSchedule,
  now: Date = new Date()
): ScheduleState {
  const { scheduledAmount, scheduledAt } = schedule;

  // 片方だけの状態は DB の CHECK で弾いているが、
  // 画面側でも「予約なし」に倒して壊れた表示を出さない
  if (scheduledAmount === null || !scheduledAt) {
    return { kind: "none" };
  }

  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) {
    return { kind: "none" };
  }

  return now.getTime() >= at.getTime()
    ? { kind: "applied", amount: scheduledAmount, at }
    : { kind: "pending", amount: scheduledAmount, at };
}

/**
 * いま実際に配られている額。
 *
 * ⚠️ 画面に出す「現在の額」は必ずこれを使うこと。テーブルの `amount` を
 * そのまま出すと、切替後に「画面は 20 と言っているのに 10 が配られている」
 * という状態になる。
 */
export function resolveEffectiveAmount(
  amount: number,
  schedule: PercoinSchedule,
  now: Date = new Date()
): number {
  const state = resolveScheduleState(schedule, now);
  return state.kind === "applied" ? state.amount : amount;
}

/** 保存できる予約日時か。過去は指定できない。 */
export function validateScheduledAt(
  scheduledAt: string,
  now: Date = new Date()
): string | null {
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) {
    return "切替日時の形式が正しくありません";
  }
  if (at.getTime() <= now.getTime()) {
    return "切替日時は未来を指定してください";
  }
  return null;
}

export interface ScheduleChange {
  /** 画面に出す項目名（例: 投稿ボーナス：フリースタイル / 連続ログイン 14日目） */
  label: string;
  /** いまの額 */
  currentAmount: number;
  /** 切替後の額 */
  nextAmount: number;
  /** 切替日時(ISO) */
  at: string;
}

/**
 * 保存前の確認に出す「いつ・何が・いくつになるか」を日時ごとにまとめる。
 *
 * 予約は複数の項目にまたがるうえ、一括指定を使うと同じ日時に何件も並ぶ。
 * 保存ボタンを押す前にこの形で見せることで、「14日目だけ直したつもりが
 * 全部に日時が入っていた」といった取り違えに気づける。
 */
export function summarizeScheduleChanges(
  changes: ScheduleChange[]
): Array<{ at: string; items: ScheduleChange[] }> {
  const byDate = new Map<string, ScheduleChange[]>();

  for (const change of changes) {
    const list = byDate.get(change.at) ?? [];
    list.push(change);
    byDate.set(change.at, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([at, items]) => ({ at, items }));
}
