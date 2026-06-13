/**
 * コレクション企画のユニークユーザー(UU)ファネル(B-2 / A-5 / A-8)。
 * - ログイン側のみ。ゲストは style_usage_events.user_id が NULL のため UU 計測不可。
 * - 生成UU → コンプリートUU → シェアUU の歩留まり、および
 *   期間内登録UU → コンプリート の到達率/離脱を算出する。
 */
export interface CollectionUuFunnel {
  generatesUu: number; // 神コレ生成したログインUU
  completionsUu: number; // コンプリート到達UU
  sharesUu: number; // シェアしたUU
  reachRatePct: number | null; // B-2: コンプリートUU / 生成UU
  registeredUu: number; // 期間内に新規登録したUU
  registeredCompletedUu: number; // うちコンプリート到達
  registeredReachRatePct: number | null; // A-5: 登録→コンプリート率
  registeredNotCompletedUu: number; // A-8: 登録したが未コンプリート
  completedNotSharedUu: number; // A-8: コンプリートしたが未シェア
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function intersectionSize(target: Set<string>, other: Set<string>): number {
  let count = 0;
  for (const id of target) {
    if (other.has(id)) {
      count += 1;
    }
  }
  return count;
}

export function buildCollectionUuFunnel(params: {
  generateMemberUserIds: string[];
  completerUserIds: string[];
  shareUserIds: string[];
  registeredUserIds: string[];
}): CollectionUuFunnel {
  const generates = new Set(params.generateMemberUserIds.filter(Boolean));
  const completers = new Set(params.completerUserIds.filter(Boolean));
  const sharers = new Set(params.shareUserIds.filter(Boolean));
  const registered = new Set(params.registeredUserIds.filter(Boolean));

  const generatesUu = generates.size;
  const completionsUu = completers.size;
  const sharesUu = sharers.size;
  const registeredUu = registered.size;
  const registeredCompletedUu = intersectionSize(completers, registered);
  const completedSharedUu = intersectionSize(completers, sharers);

  return {
    generatesUu,
    completionsUu,
    sharesUu,
    reachRatePct: rate(completionsUu, generatesUu),
    registeredUu,
    registeredCompletedUu,
    registeredReachRatePct: rate(registeredCompletedUu, registeredUu),
    registeredNotCompletedUu: Math.max(0, registeredUu - registeredCompletedUu),
    completedNotSharedUu: Math.max(0, completionsUu - completedSharedUu),
  };
}
