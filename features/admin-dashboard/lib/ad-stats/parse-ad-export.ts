import { createHash } from "node:crypto";
import {
  AD_EXPORT_GROUP_KEY_PREFIX,
  AD_NAME_KEY_PREFIX,
  type AdBreakdownType,
  type AdIdentity,
  type AdStatRow,
  type ParsedAdExport,
} from "./ad-stats-types";

/**
 * 広告の書き出し（表の形にしたもの）を、ad_platform_daily_stats の行にそろえる。
 *
 *  - Meta: 広告マネージャのレポートを日本語の画面から CSV（または xlsx）で書き出したもの。
 *    「内訳」で年齢・性別・配置を選べる。広告 ID の列は無いので、広告名で見分ける。
 *  - X: 広告の画面から書き出した xlsx。広告ごと日ごとのシートと、
 *    地域・端末・年齢・性別ごとのシート（書き出し全体の数字）が入っている。
 *
 * どちらも「日ごと」の書き出しだけを受け付ける（期間まとめの数字は、日の表に入れられない）。
 * 形が想定と違うときは AdExportFormatError を投げ、黙って間違った数字を入れない。
 */

export class AdExportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdExportFormatError";
  }
}

export interface AdExportTable {
  /** シート名（CSV は空文字） */
  name: string;
  rows: string[][];
}

const META = {
  start: "レポート開始日",
  end: "レポート終了日",
  adName: "広告名",
  spend: "消化金額 (JPY)",
  impressions: "インプレッション",
  reach: "リーチ",
  linkClicks: "リンククリック",
  landingPageViews: "ランディングページビュー",
  age: "年齢",
  gender: "性別",
  platform: "プラットフォーム",
  position: "配置",
  device: "デバイスプラットフォーム",
} as const;

const X = {
  period: "Time period",
  date: "Date",
  adId: "Ad ID",
  adName: "Ad name",
  spend: "Spend",
  impressions: "Impressions",
  linkClicks: "Link clicks",
  videoViews: "Video views",
} as const;

const X_BREAKDOWN_COLUMNS: Array<[string, AdBreakdownType]> = [
  ["Age", "age"],
  ["Gender", "gender"],
  ["Platform", "device"],
  ["Location", "location"],
];

const AD_NAME_MAX = 300;
/** DB の ad_key の上限（CHECK）と同じ */
const AD_KEY_MAX = 300;
const BREAKDOWN_VALUE_MAX = 200;

function header(table: AdExportTable): string[] {
  return (table.rows[0] ?? []).map((cell) => cell.trim());
}

function columnFinder(table: AdExportTable) {
  const names = header(table);
  return (name: string): number | null => {
    const index = names.indexOf(name);
    return index >= 0 ? index : null;
  };
}

function cell(row: string[], index: number | null): string {
  return index === null ? "" : (row[index] ?? "").trim();
}

/** 列が無ければ null、空欄や "-" は 0。数字でなければ形の違いとして止める */
function numberCell(row: string[], index: number | null, label: string): number | null {
  if (index === null) return null;
  const raw = cell(row, index).replace(/,/g, "");
  if (raw === "" || raw === "-" || raw === "―") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new AdExportFormatError(`「${label}」の値「${raw}」を数字として読めません`);
  }
  return value;
}

function countCell(row: string[], index: number | null, label: string): number | null {
  const value = numberCell(row, index, label);
  return value === null ? null : Math.round(value);
}

/** Excel の日付の通し番号（1900年方式）を YYYY-MM-DD にする */
function excelSerialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function dateCell(row: string[], index: number | null, label: string): string {
  const raw = cell(row, index);
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    // 2026-02-30 のような実在しない日は、DB に入れる前に止める
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }
  } else if (/^\d{5}(\.\d+)?$/.test(raw)) {
    return excelSerialToDate(Number(raw));
  }
  throw new AdExportFormatError(
    `「${label}」の値「${raw}」が1日の日付ではありません。日ごとに書き出してください`,
  );
}

/** 文字（コードポイント）で数えて切る。DB の char_length と同じ数え方で、絵文字を途中で割らない */
function clip(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

function normalizeAge(value: string): string {
  const compact = value.replace(/\s+/g, "");
  return compact.toLowerCase() === "unknown" ? "unknown" : compact;
}

function normalizeGender(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "male" || lower === "男性") return "male";
  if (lower === "female" || lower === "女性") return "female";
  if (lower === "unknown" || lower === "不明") return "unknown";
  return value.trim();
}

function sumNullable(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function rowKey(row: AdStatRow): string {
  return [row.platform, row.statDate, row.adKey, row.breakdownType, row.breakdownValue].join("\u0000");
}

/**
 * 同じ日・広告・内訳の行を足し合わせる（例: 年齢と性別を同時に選んだ書き出しを、年齢の行にまとめる）。
 * リーチは足すと同じ人を二重に数えるので、2行以上まとめたときは null にする。
 */
export function mergeAdStatRows(rows: AdStatRow[]): AdStatRow[] {
  const merged = new Map<string, AdStatRow>();
  for (const row of rows) {
    const key = rowKey(row);
    const target = merged.get(key);
    if (!target) {
      merged.set(key, { ...row });
      continue;
    }
    target.spendJpy += row.spendJpy;
    target.impressions += row.impressions;
    target.linkClicks = sumNullable(target.linkClicks, row.linkClicks);
    target.landingPageViews = sumNullable(target.landingPageViews, row.landingPageViews);
    target.videoViews = sumNullable(target.videoViews, row.videoViews);
    target.reach = null;
  }
  return [...merged.values()].map((row) => ({
    ...row,
    spendJpy: Math.round(row.spendJpy * 100) / 100,
  }));
}

function isEmptyDay(row: Pick<AdStatRow, "spendJpy" | "impressions">): boolean {
  return row.spendJpy === 0 && row.impressions === 0;
}

function uniqueAds(ads: AdIdentity[]): AdIdentity[] {
  const seen = new Map<string, AdIdentity>();
  for (const ad of ads) seen.set(`${ad.platform}\u0000${ad.adKey}`, ad);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Meta

function isMetaTable(table: AdExportTable): boolean {
  const names = header(table);
  return names.includes(META.adName) && names.includes(META.spend);
}

function parseMetaTable(table: AdExportTable): ParsedAdExport {
  const col = columnFinder(table);
  for (const required of [META.start, META.end, META.adName, META.spend, META.impressions]) {
    if (col(required) === null) {
      throw new AdExportFormatError(`Meta の書き出しに「${required}」の列がありません`);
    }
  }
  const ageCol = col(META.age);
  const genderCol = col(META.gender);
  const placementCols = [col(META.platform), col(META.position), col(META.device)].filter(
    (index): index is number => index !== null,
  );

  const rows: AdStatRow[] = [];
  const ads: AdIdentity[] = [];
  for (const raw of table.rows.slice(1)) {
    const adName = clip(cell(raw, col(META.adName)), AD_NAME_MAX);
    // 合計の行（広告名が空）は、広告ごとの行と二重になるので読まない
    if (adName === "") continue;
    const start = dateCell(raw, col(META.start), META.start);
    const end = dateCell(raw, col(META.end), META.end);
    if (start !== end) {
      throw new AdExportFormatError(
        "日ごとの書き出しではありません。広告マネージャの「内訳」→「時間」→「日」を選んで書き出してください",
      );
    }
    const base = {
      platform: "meta" as const,
      statDate: start,
      adKey: clip(`${AD_NAME_KEY_PREFIX}${adName}`, AD_KEY_MAX),
      adName,
      spendJpy: numberCell(raw, col(META.spend), META.spend) ?? 0,
      impressions: countCell(raw, col(META.impressions), META.impressions) ?? 0,
      reach: countCell(raw, col(META.reach), META.reach),
      linkClicks: countCell(raw, col(META.linkClicks), META.linkClicks),
      landingPageViews: countCell(raw, col(META.landingPageViews), META.landingPageViews),
      videoViews: null,
    };
    if (isEmptyDay(base)) continue;
    ads.push({ platform: "meta", adKey: base.adKey, adName });

    const breakdowns: Array<[AdBreakdownType, string]> = [];
    if (ageCol !== null) breakdowns.push(["age", normalizeAge(cell(raw, ageCol))]);
    if (genderCol !== null) breakdowns.push(["gender", normalizeGender(cell(raw, genderCol))]);
    if (placementCols.length > 0) {
      breakdowns.push([
        "placement",
        placementCols.map((index) => cell(raw, index)).filter(Boolean).join(" / "),
      ]);
    }
    if (breakdowns.length === 0) breakdowns.push(["none", ""]);
    for (const [breakdownType, value] of breakdowns) {
      rows.push({
        ...base,
        breakdownType,
        breakdownValue:
          breakdownType === "none" ? "" : clip(value || "unknown", BREAKDOWN_VALUE_MAX),
      });
    }
  }
  return { platform: "meta", rows: mergeAdStatRows(rows), ads: uniqueAds(ads) };
}

// ---------------------------------------------------------------------------
// X

function isXAdTable(table: AdExportTable): boolean {
  const names = header(table);
  return names.includes(X.adId) && names.includes(X.adName) && names.includes(X.spend);
}

function xBreakdownColumn(table: AdExportTable): [number, AdBreakdownType] | null {
  const col = columnFinder(table);
  if (col(X.date) === null || col(X.spend) === null || col(X.adId) !== null) return null;
  for (const [name, type] of X_BREAKDOWN_COLUMNS) {
    const index = col(name);
    if (index !== null) return [index, type];
  }
  return null;
}

/** 表ごとに列の位置を1回だけ探し、行ごとの数字を読む関数を返す */
function xMetricsReader(table: AdExportTable) {
  const col = columnFinder(table);
  const spend = col(X.spend);
  const impressions = col(X.impressions);
  const linkClicks = col(X.linkClicks);
  const videoViews = col(X.videoViews);
  return (raw: string[]) => ({
    spendJpy: numberCell(raw, spend, X.spend) ?? 0,
    impressions: countCell(raw, impressions, X.impressions) ?? 0,
    reach: null,
    linkClicks: countCell(raw, linkClicks, X.linkClicks),
    landingPageViews: null,
    videoViews: countCell(raw, videoViews, X.videoViews),
  });
}

/**
 * X の内訳の行の ad_key。Ad ID を並べると長くなるときは、並びのハッシュにする
 * （途中で切ると、別の広告の組み合わせが同じ ad_key になって上書きし合うため）。
 */
function exportGroupKey(ids: string[]): string {
  const plain = `${AD_EXPORT_GROUP_KEY_PREFIX}${ids.join(",")}`;
  if (Array.from(plain).length <= AD_KEY_MAX) return plain;
  const digest = createHash("sha256").update(ids.join(",")).digest("hex");
  return `${AD_EXPORT_GROUP_KEY_PREFIX}sha256:${digest}`;
}

/** 内訳のシートの、日付が空の行・合計の行（広告の画面が最後に付けることがある） */
function isXTotalRow(raw: string[], dateIndex: number | null): boolean {
  const first = (raw[0] ?? "").trim().toLowerCase();
  return cell(raw, dateIndex) === "" || first === "total" || first === "合計";
}

function parseXTables(tables: AdExportTable[]): ParsedAdExport {
  const adTable = tables.find(isXAdTable);
  if (!adTable) {
    throw new AdExportFormatError(
      "X の書き出しに、広告ごとのシート（Ad ID・Ad name・Spend の列）がありません",
    );
  }
  const col = columnFinder(adTable);
  const adMetrics = xMetricsReader(adTable);
  const dateIndex = col(X.period) ?? col(X.date);
  if (dateIndex === null) {
    throw new AdExportFormatError("X の書き出しに「Time period」の列がありません");
  }

  const rows: AdStatRow[] = [];
  const ads: AdIdentity[] = [];
  const allAds = new Map<string, string>();
  for (const raw of adTable.rows.slice(1)) {
    const adId = cell(raw, col(X.adId));
    if (adId === "") continue;
    const adName = clip(cell(raw, col(X.adName)) || adId, AD_NAME_MAX);
    allAds.set(adId, adName);
    const row: AdStatRow = {
      platform: "x",
      statDate: dateCell(raw, dateIndex, X.period),
      adKey: adId,
      adName,
      breakdownType: "none",
      breakdownValue: "",
      ...adMetrics(raw),
    };
    ads.push({ platform: "x", adKey: adId, adName });
    if (!isEmptyDay(row)) rows.push(row);
  }

  // 年齢などのシートは書き出し全体の数字。どの広告の合計かを ad_key に残す
  const ids = [...allAds.keys()].sort();
  const groupKey = exportGroupKey(ids);
  const groupName = clip(
    `この書き出しの広告すべて（${ids.map((id) => allAds.get(id)).join("・")}）`,
    AD_NAME_MAX,
  );
  for (const table of tables) {
    const breakdown = xBreakdownColumn(table);
    if (!breakdown) continue;
    const [valueIndex, breakdownType] = breakdown;
    const dateIdx = columnFinder(table)(X.date);
    const metrics = xMetricsReader(table);
    for (const raw of table.rows.slice(1)) {
      if (isXTotalRow(raw, dateIdx)) continue;
      const rawValue = cell(raw, valueIndex);
      const value =
        breakdownType === "age"
          ? normalizeAge(rawValue)
          : breakdownType === "gender"
            ? normalizeGender(rawValue)
            : rawValue;
      const row: AdStatRow = {
        platform: "x",
        statDate: dateCell(raw, dateIdx, X.date),
        adKey: groupKey,
        adName: groupName,
        breakdownType,
        breakdownValue: clip(value || "unknown", BREAKDOWN_VALUE_MAX),
        ...metrics(raw),
      };
      if (!isEmptyDay(row)) rows.push(row);
    }
  }
  return { platform: "x", rows: mergeAdStatRows(rows), ads: uniqueAds(ads) };
}

// ---------------------------------------------------------------------------

/** 表の見出しから Meta か X かを決めて読む。どちらでもなければ止める。 */
export function parseAdExport(tables: AdExportTable[]): ParsedAdExport {
  const meta = tables.find(isMetaTable);
  if (meta) return parseMetaTable(meta);
  if (tables.some(isXAdTable)) return parseXTables(tables);
  throw new AdExportFormatError(
    "Meta（広告マネージャの日本語の書き出し）か X（広告の画面の書き出し）の形ではありません",
  );
}
