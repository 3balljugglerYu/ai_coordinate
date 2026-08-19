/**
 * 指標ごとの「いつから企画別に数えられるか」を持ち、集計期間と突き合わせる(ADR-003)。
 *
 * ## なぜ必要か
 *
 * 計装は指標ごとに別々の日に入った。計装前の期間を集計すると、行が無いので
 * **`0` が表示される**。だが実際は「0件だった」のではなく「取れていない」。
 * この2つが画面上で同じ見た目になっていた。
 *
 * 実害の例: 神コレクション(2026-06-10 開始)のシェアは、企画への紐づけが
 * 2026-06-13 に始まったため最初の3日ぶんが数えられていない。それを知らずに
 * ファッション雑誌企画のシェア数と並べると、比較が成立しない。
 *
 * これは `#532`(終了した企画が黙って無反応になる)と同じ型の問題で、
 * 「安全側に倒したつもりの沈黙」が読み手に誤った確信を与えている。
 *
 * ## なぜ定数表なのか
 *
 * DB から「最初の非 NULL」を動的に引くこともできるが、テストデータの投入や
 * 将来のバックフィルで簡単に狂う。**すでに事実として確定した日付**なので
 * 定数の方が安全。追記を忘れた場合は「計測できているのに partial と出る」
 * 方向(安全側)に倒れる。
 */

/** 計装開始日を持つ指標。ここに無い指標は常に計測可能として扱う。 */
export type InstrumentedMetricKey =
  | "visitsMember"
  | "visitsGuest"
  | "generatesGuestUu"
  | "shares";

export type MetricAvailabilityStatus =
  /** 期間全体が計装後。数値をそのまま読んでよい */
  | "available"
  /** 期間の途中から計装。数値は下振れしている */
  | "partial"
  /** 期間全体が計装前。数値は常に 0 で、意味を持たない */
  | "unavailable";

export interface MetricAvailability {
  status: MetricAvailabilityStatus;
  /** 計装開始の瞬間(ISO)。available でも参照できるよう常に返す */
  instrumentedSince: string | null;
}

/**
 * 企画別に数えられるようになった瞬間(実測値)。
 *
 * - visit の `category_key` / `viewer_key`、generate の `viewer_key`:
 *   マイグレーション 20260817120000 の適用直後から
 * - mount_shared の `style_id` への categoryKey 格納: share-event route の計装開始
 *
 * いずれも本番 `style_usage_events` の「最初に値が入った行」を照会して確定した。
 */
export const COLLECTION_METRIC_INSTRUMENTED_SINCE: Record<
  InstrumentedMetricKey,
  string
> = {
  visitsMember: "2026-08-17T13:28:10.050Z",
  visitsGuest: "2026-08-17T13:28:10.050Z",
  generatesGuestUu: "2026-08-17T13:30:00.629Z",
  shares: "2026-06-13T12:35:17.140Z",
};

function isInstrumentedKey(key: string): key is InstrumentedMetricKey {
  return key in COLLECTION_METRIC_INSTRUMENTED_SINCE;
}

/**
 * 指標 × 集計期間から、その数値をどう読むべきかを返す。
 *
 * @param metricKey KPI のキー。計装開始日を持たないキーは常に available
 * @param rangeStartIso 集計期間の開始
 * @param rangeEndIso 集計期間の終了
 */
export function resolveMetricAvailability(
  metricKey: string,
  rangeStartIso: string,
  rangeEndIso: string,
): MetricAvailability {
  if (!isInstrumentedKey(metricKey)) {
    return { status: "available", instrumentedSince: null };
  }

  const since = COLLECTION_METRIC_INSTRUMENTED_SINCE[metricKey];
  const sinceMs = Date.parse(since);
  const startMs = Date.parse(rangeStartIso);
  const endMs = Date.parse(rangeEndIso);

  // 日付が壊れているときは「読めない」と言い切らず、注記付き(partial)に倒す。
  // available と言い切ると誤った確信を与えるため。
  if (Number.isNaN(sinceMs) || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { status: "partial", instrumentedSince: since };
  }

  // 期間が丸ごと計装前。0 は「0件」ではなく「取れていない」
  if (endMs <= sinceMs) {
    return { status: "unavailable", instrumentedSince: since };
  }
  // 期間の途中から計装が始まった。数値は下振れしている
  if (startMs < sinceMs) {
    return { status: "partial", instrumentedSince: since };
  }
  return { status: "available", instrumentedSince: since };
}

/** 表示用の短い注記。カードの下に出す。 */
export function describeMetricAvailability(
  availability: MetricAvailability,
): string | null {
  if (availability.status === "available" || !availability.instrumentedSince) {
    return null;
  }
  const label = formatInstrumentedSince(availability.instrumentedSince);
  return availability.status === "unavailable"
    ? `計測対象外（${label} 計装開始）`
    : `一部のみ（${label} 計装開始）`;
}

function formatInstrumentedSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
