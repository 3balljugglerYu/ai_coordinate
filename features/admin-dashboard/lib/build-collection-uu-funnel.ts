/**
 * コレクション企画のユニークユーザー(UU)ファネル(B-2 / A-5 / A-8)。
 * - 生成UU → コンプリートUU → シェアUU の歩留まり、および
 *   期間内登録UU → コンプリート の到達率/離脱を算出する。
 * - 訪問UU とゲストは viewer_key(`u:<user_id>` / `g:<ip_hash>`)で数える。
 *   2026-08-17 の計装より前は viewer_key が NULL のため 0 になる(遡れない)。
 *   ゲストは端末/回線単位の近似であり、実人数とは一致しない。
 */
export interface CollectionUuFunnel {
  visitsMemberUu: number; // 企画ページを訪れたログインUU
  visitsGuestUu: number; // 同ゲストUU(IPハッシュ単位の近似)
  generatesGuestUu: number; // 生成したゲストUU
  guestGenerateRatePct: number | null; // ゲスト訪問UU → ゲスト生成UU
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

/** null / 空文字を捨てて distinct 件数を返す(viewer_key 用)。 */
function countDistinct(values: (string | null)[] | undefined): number {
  return new Set((values ?? []).filter((value): value is string => !!value))
    .size;
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
  /** viewer_key。null(IP 取得不可・計装前)は除外して数える。 */
  visitMemberViewerKeys?: (string | null)[];
  visitGuestViewerKeys?: (string | null)[];
  generateGuestViewerKeys?: (string | null)[];
  generateMemberUserIds: string[];
  completerUserIds: string[];
  shareUserIds: string[];
  registeredUserIds: string[];
}): CollectionUuFunnel {
  const generates = new Set(params.generateMemberUserIds.filter(Boolean));
  const completers = new Set(params.completerUserIds.filter(Boolean));
  const sharers = new Set(params.shareUserIds.filter(Boolean));
  const registered = new Set(params.registeredUserIds.filter(Boolean));

  const visitsMemberUu = countDistinct(params.visitMemberViewerKeys);
  const visitsGuestUu = countDistinct(params.visitGuestViewerKeys);
  const generatesGuestUu = countDistinct(params.generateGuestViewerKeys);

  const generatesUu = generates.size;
  const completionsUu = completers.size;
  const sharesUu = sharers.size;
  const registeredUu = registered.size;
  const registeredCompletedUu = intersectionSize(completers, registered);
  const completedSharedUu = intersectionSize(completers, sharers);

  return {
    visitsMemberUu,
    visitsGuestUu,
    generatesGuestUu,
    guestGenerateRatePct: rate(generatesGuestUu, visitsGuestUu),
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
