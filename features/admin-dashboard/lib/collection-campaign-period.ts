/**
 * 企画の会期(preset_categories の表示期間)を集計期間として使える形に解決する(ADR-006)。
 *
 * これまで既定は「直近30日」で、会期を見るには毎回 datetime-local に手入力していた。
 * 会期は DB にあるのだから既定にできる。手入力は毎回同じ操作の繰り返しで、
 * 打ち間違いがそのまま誤った資料になる。
 */

export interface CampaignPeriod {
  fromIso: string;
  toIso: string;
  /** 会期の終わりが未来(=開催中)で、終端を「今」に切り詰めたか */
  isOngoing: boolean;
}

/**
 * 表示期間から集計期間を作る。決められない場合は null(呼び出し側は従来の既定に落ちる)。
 *
 * 終端は **会期終了と「今」の早い方**に切り詰める。開催中の企画で終端を未来のまま
 * 使うと、前期間比の「前期間」が会期の全長ぶん遡ってしまい、比較にならない
 * (実際に取れる行が無いので現在期間だけが短く、前期間だけが長い形になる)。
 */
export function resolveCampaignPeriod(params: {
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
  now?: Date;
}): CampaignPeriod | null {
  const now = params.now ?? new Date();
  if (!params.startsAt) return null;

  const startMs = Date.parse(params.startsAt);
  if (Number.isNaN(startMs)) return null;

  const endMsRaw = params.endsAt ? Date.parse(params.endsAt) : Number.NaN;
  // 終了未設定(常設化した企画)は「今」まで。
  const hasEnd = !Number.isNaN(endMsRaw);
  const nowMs = now.getTime();
  const endMs = hasEnd ? Math.min(endMsRaw, nowMs) : nowMs;

  // 開始前の企画(会期がまるごと未来)は集計しようがない。
  if (endMs <= startMs) return null;

  return {
    fromIso: new Date(startMs).toISOString(),
    toIso: new Date(endMs).toISOString(),
    isOngoing: hasEnd && endMsRaw > nowMs,
  };
}
