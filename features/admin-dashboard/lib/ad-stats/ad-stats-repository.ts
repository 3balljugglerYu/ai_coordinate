import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "../fetch-all-rows";
import { getOperatorUserIds } from "../get-operator-user-ids";
import type { AdPlatform, AdStatRow, ParsedAdExport } from "./ad-stats-types";
import {
  summarizeAdStats,
  type AdFunnel,
  type AdMeta,
  type AdStatsSummary,
} from "./summarize-ad-stats";

/**
 * 広告の数字（ad_platform_daily_stats）と広告ごとの目印（ad_platform_ads）の読み書き。
 * どちらも service_role だけが触る。
 */

const UPSERT_CHUNK = 500;
/** URL が長くなりすぎないよう、user_id の絞り込みはこの数ずつに分ける */
const IN_CHUNK = 100;
/** 目印の候補に出す、最近の登録の範囲 */
const SIGNUP_SOURCE_LOOKBACK_DAYS = 180;

interface StatDbRow {
  id: string;
  platform: AdPlatform;
  stat_date: string;
  ad_key: string;
  ad_name: string;
  breakdown_type: AdStatRow["breakdownType"];
  breakdown_value: string;
  spend_jpy: number | string;
  impressions: number | string;
  link_clicks: number | string | null;
  landing_page_views: number | string | null;
  video_views: number | string | null;
}

interface AdDbRow {
  id: string;
  platform: AdPlatform;
  ad_key: string;
  signup_source: string | null;
}

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function toNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * 取り込んだ書き出しを保存する。同じ日・広告・内訳の行は上書きするので、
 * 途中で失敗しても、同じファイルをもう一度取り込めば正しい状態になる。
 * 広告の行（目印）は名前だけ更新し、選んである目印は消さない。
 */
export async function saveAdExport(
  parsed: ParsedAdExport,
  importedBy: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = getSupabase(client);
  const importedAt = new Date().toISOString();

  for (const part of chunk(parsed.rows, UPSERT_CHUNK)) {
    const { error } = await supabase.from("ad_platform_daily_stats").upsert(
      part.map((row) => ({
        platform: row.platform,
        stat_date: row.statDate,
        ad_key: row.adKey,
        ad_name: row.adName,
        breakdown_type: row.breakdownType,
        breakdown_value: row.breakdownValue,
        spend_jpy: row.spendJpy,
        impressions: row.impressions,
        reach: row.reach,
        link_clicks: row.linkClicks,
        landing_page_views: row.landingPageViews,
        video_views: row.videoViews,
        source: "upload",
        imported_by: importedBy,
        imported_at: importedAt,
      })),
      { onConflict: "platform,stat_date,ad_key,breakdown_type,breakdown_value" },
    );
    if (error) throw new Error(`広告の数字の保存に失敗しました: ${error.message}`);
  }

  for (const part of chunk(parsed.ads, UPSERT_CHUNK)) {
    const { error } = await supabase.from("ad_platform_ads").upsert(
      part.map((ad) => ({ platform: ad.platform, ad_key: ad.adKey, ad_name: ad.adName })),
      { onConflict: "platform,ad_key" },
    );
    if (error) throw new Error(`広告の一覧の保存に失敗しました: ${error.message}`);
  }
}

/** 広告の目印を変える。広告が無ければ false。 */
export async function updateAdSignupSource(
  input: { platform: AdPlatform; adKey: string; signupSource: string | null; updatedBy: string },
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("ad_platform_ads")
    .update({ signup_source: input.signupSource, updated_by: input.updatedBy })
    .eq("platform", input.platform)
    .eq("ad_key", input.adKey)
    .select("id");
  if (error) throw new Error(`目印の保存に失敗しました: ${error.message}`);
  return (data ?? []).length > 0;
}

async function listStatRows(supabase: SupabaseClient): Promise<StatDbRow[]> {
  const { data, error } = await fetchAllRows<StatDbRow>((cursor, size) => {
    let query = supabase
      .from("ad_platform_daily_stats")
      .select(
        "id, platform, stat_date, ad_key, ad_name, breakdown_type, breakdown_value, spend_jpy, impressions, link_clicks, landing_page_views, video_views",
      );
    if (cursor) query = query.gt("id", cursor);
    return query.order("id", { ascending: true }).limit(size);
  });
  if (error) throw new Error(`広告の数字の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

async function listAds(supabase: SupabaseClient): Promise<AdDbRow[]> {
  const { data, error } = await fetchAllRows<AdDbRow>((cursor, size) => {
    let query = supabase.from("ad_platform_ads").select("id, platform, ad_key, signup_source");
    if (cursor) query = query.gt("id", cursor);
    return query.order("id", { ascending: true }).limit(size);
  });
  if (error) throw new Error(`広告の一覧の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/** user_id ごとに、条件に合う行があるか（生成・投稿の人数を数えるため） */
async function usersWithRows(
  supabase: SupabaseClient,
  table: "image_jobs" | "generated_images",
  userIds: string[],
  filter: { column: string; value: string | boolean },
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const ids of chunk(userIds, IN_CHUNK)) {
    const { data, error } = await fetchAllRows<{ id: string; user_id: string }>((cursor, size) => {
      let query = supabase
        .from(table)
        .select("id, user_id")
        .in("user_id", ids)
        .eq(filter.column, filter.value);
      if (cursor) query = query.gt("id", cursor);
      return query.order("id", { ascending: true }).limit(size);
    });
    if (error) throw new Error(`${table} の取得に失敗しました: ${error.message}`);
    for (const row of data ?? []) found.add(row.user_id);
  }
  return found;
}

/**
 * 目印ごとの登録・生成・投稿の人数。運営（集計から除く人）は数えない。
 * 生成は「成功した生成が1回以上」、投稿は「投稿した画像が1枚以上」。
 */
async function getFunnelBySource(
  supabase: SupabaseClient,
  sources: string[],
): Promise<Map<string, AdFunnel>> {
  const funnel = new Map<string, AdFunnel>();
  if (sources.length === 0) return funnel;
  const operators = new Set(await getOperatorUserIds({ strict: true }));

  const { data, error } = await fetchAllRows<{ id: string; user_id: string; signup_source: string }>(
    (cursor, size) => {
      let query = supabase
        .from("profiles")
        .select("id, user_id, signup_source")
        .in("signup_source", sources);
      if (cursor) query = query.gt("id", cursor);
      return query.order("id", { ascending: true }).limit(size);
    },
  );
  if (error) throw new Error(`登録の取得に失敗しました: ${error.message}`);
  const profiles = (data ?? []).filter((row) => !operators.has(row.user_id));
  const userIds = profiles.map((row) => row.user_id);

  const [generated, posted] = await Promise.all([
    usersWithRows(supabase, "image_jobs", userIds, { column: "status", value: "succeeded" }),
    usersWithRows(supabase, "generated_images", userIds, { column: "is_posted", value: true }),
  ]);

  for (const source of sources) funnel.set(source, { signups: 0, generated: 0, posted: 0 });
  for (const row of profiles) {
    const entry = funnel.get(row.signup_source)!;
    entry.signups += 1;
    if (generated.has(row.user_id)) entry.generated += 1;
    if (posted.has(row.user_id)) entry.posted += 1;
  }
  return funnel;
}

/** 目印の候補（最近の登録に付いていた目印と、広告に選んである目印） */
async function listRecentSignupSources(
  supabase: SupabaseClient,
  chosen: string[],
): Promise<string[]> {
  const since = new Date(Date.now() - SIGNUP_SOURCE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await fetchAllRows<{ id: string; signup_source: string }>(
    (cursor, size) => {
      let query = supabase
        .from("profiles")
        .select("id, signup_source")
        .not("signup_source", "is", null)
        .gte("created_at", since);
      if (cursor) query = query.gt("id", cursor);
      return query.order("id", { ascending: true }).limit(size);
    },
  );
  if (error) throw new Error(`目印の候補の取得に失敗しました: ${error.message}`);
  return [...new Set([...(data ?? []).map((row) => row.signup_source), ...chosen])].sort();
}

export interface AdStatsOverview extends AdStatsSummary {
  signupSourceOptions: string[];
}

export async function getAdStatsOverview(client?: SupabaseClient): Promise<AdStatsOverview> {
  const supabase = getSupabase(client);
  const [statRows, adRows] = await Promise.all([listStatRows(supabase), listAds(supabase)]);
  const ads: AdMeta[] = adRows.map((row) => ({
    platform: row.platform,
    adKey: row.ad_key,
    signupSource: row.signup_source,
  }));
  const chosen = [...new Set(ads.map((ad) => ad.signupSource).filter((s): s is string => !!s))];
  const [funnel, signupSourceOptions] = await Promise.all([
    getFunnelBySource(supabase, chosen),
    listRecentSignupSources(supabase, chosen),
  ]);

  const summary = summarizeAdStats(
    statRows.map((row) => ({
      platform: row.platform,
      statDate: row.stat_date,
      adKey: row.ad_key,
      adName: row.ad_name,
      breakdownType: row.breakdown_type,
      breakdownValue: row.breakdown_value,
      spendJpy: Number(row.spend_jpy),
      impressions: Number(row.impressions),
      linkClicks: toNumber(row.link_clicks),
      landingPageViews: toNumber(row.landing_page_views),
      videoViews: toNumber(row.video_views),
    })),
    ads,
    funnel,
  );
  return { ...summary, signupSourceOptions };
}
