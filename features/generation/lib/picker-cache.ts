"use client";

/**
 * 画像ソースピッカーのクライアントサイド・キャッシュ。
 *
 * ボトムシートを開くたびにネットワーク fetch を待つと、初回表示まで数百 ms
 * の体感ラグが出る。本モジュールはモジュールスコープの軽量キャッシュと
 * in-flight promise dedup を提供し、以下を可能にする。
 *
 * - ピッカートリガー (ボタン) を持つ画面が mount された瞬間に prefetch
 *   を発火 → ユーザーがボタンを押すまでにデータが揃う
 * - ボトムシート close 後の再 open でもキャッシュをそのまま再利用 (即時表示)
 * - active 化したタブは裏で revalidate し、差分があれば自動で更新 (SWR-like)
 *
 * 注意:
 * - SPA セッション内の一時キャッシュ。タブを閉じれば消える。
 * - stock 側は upload / delete があるため、ミューテーション時に
 *   `clearStockCache()` を呼ぶこと (StockImagesTab 側で実装)。
 */

import type { PickerSourceItem } from "../types";
import { getSourceImageStocks } from "./database";
import type { SourceImageStock } from "./database";

type GeneratedItem = Extract<PickerSourceItem, { kind: "generated" }>;

interface GeneratedFirstPage {
  items: GeneratedItem[];
  nextOffset: number | null;
}

interface StockFirstPage {
  stocks: SourceImageStock[];
}

const generatedFirstPage: { data: GeneratedFirstPage | null } = { data: null };
const stockFirstPage: { data: StockFirstPage | null } = { data: null };

let generatedInflight: Promise<GeneratedFirstPage> | null = null;
let stockInflight: Promise<StockFirstPage> | null = null;

const DEFAULT_GENERATED_LIMIT = 50;
const DEFAULT_STOCK_LIMIT = 50;

export function getCachedGeneratedFirstPage(): GeneratedFirstPage | null {
  return generatedFirstPage.data;
}

export function getCachedStockFirstPage(): StockFirstPage | null {
  return stockFirstPage.data;
}

export function clearGeneratedCache(): void {
  generatedFirstPage.data = null;
}

export function clearStockCache(): void {
  stockFirstPage.data = null;
}

/**
 * 生成済み画像の先頭ページを fetch。同時に呼ばれた場合は in-flight promise
 * を共有して dedup する。成功時はキャッシュにも書き込む。
 */
export async function fetchGeneratedFirstPage(
  limit = DEFAULT_GENERATED_LIMIT,
): Promise<GeneratedFirstPage> {
  if (generatedInflight) return generatedInflight;
  generatedInflight = (async () => {
    const res = await fetch(
      `/api/generation-history/picker?limit=${limit}&offset=0`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as GeneratedFirstPage;
    generatedFirstPage.data = data;
    return data;
  })();
  try {
    return await generatedInflight;
  } finally {
    generatedInflight = null;
  }
}

/**
 * ストック画像の先頭ページを fetch。dedup + cache 書き込みは generated と同様。
 */
export async function fetchStockFirstPage(
  limit = DEFAULT_STOCK_LIMIT,
): Promise<StockFirstPage> {
  if (stockInflight) return stockInflight;
  stockInflight = (async () => {
    const stocks = await getSourceImageStocks(limit, 0);
    const data: StockFirstPage = { stocks };
    stockFirstPage.data = data;
    return data;
  })();
  try {
    return await stockInflight;
  } finally {
    stockInflight = null;
  }
}

/**
 * 失敗してもログのみ。ユーザー体験のための先取りなので throw しない。
 */
export async function prefetchGeneratedFirstPage(): Promise<void> {
  if (generatedFirstPage.data || generatedInflight) return;
  try {
    await fetchGeneratedFirstPage();
  } catch (err) {
    console.warn("[picker-cache] generated prefetch failed", err);
  }
}

export async function prefetchStockFirstPage(): Promise<void> {
  if (stockFirstPage.data || stockInflight) return;
  try {
    await fetchStockFirstPage();
  } catch (err) {
    console.warn("[picker-cache] stock prefetch failed", err);
  }
}

export async function prefetchAll(): Promise<void> {
  await Promise.all([prefetchGeneratedFirstPage(), prefetchStockFirstPage()]);
}
