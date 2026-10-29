import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllById } from "../fetch-all-rows";
import { getOperatorUserIds } from "../get-operator-user-ids";
import type { AdPlatform, AdStatRow, ParsedAdExport } from "./ad-stats-types";
import {
  attachFunnel,
  signupWindows,
  summarizeAdStats,
  type AdFunnel,
  type AdStatsSummary,
  type SignupWindow,
} from "./summarize-ad-stats";

/**
 * 広告の数字（ad_platform_daily_stats）と広告ごとの目印（ad_platform_ads）の読み書き。
 * どちらも service_role だけが触る。
 */

const UPSERT_CHUNK = 500;
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
  ad_name: string;
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
  const { data, error } = await fetchAllById<StatDbRow>(() =>
    supabase
      .from("ad_platform_daily_stats")
      .select(
        "id, platform, stat_date, ad_key, ad_name, breakdown_type, breakdown_value, spend_jpy, impressions, link_clicks, landing_page_views, video_views",
      ),
  );
  if (error) throw new Error(`広告の数字の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

async function listAds(supabase: SupabaseClient): Promise<AdDbRow[]> {
  const { data, error } = await fetchAllById<AdDbRow>(() =>
    supabase.from("ad_platform_ads").select("id, platform, ad_key, ad_name, signup_source"),
  );
  if (error) throw new Error(`広告の一覧の取得に失敗しました: ${error.message}`);
  return data ?? [];
}

/**
 * 目印ごとの登録・生成・投稿の人数（RPC get_ad_signup_funnel）。運営（集計から除く人）は数えない。
 * 生成は「成功した生成が1回以上」、投稿は「投稿した画像が1枚以上」。
 */
async function getFunnelBySource(
  supabase: SupabaseClient,
  windows: SignupWindow[],
): Promise<Map<string, AdFunnel>> {
  const funnel = new Map<string, AdFunnel>();
  if (windows.length === 0) return funnel;
  const operators = await getOperatorUserIds({ strict: true });
  const { data, error } = await supabase.rpc("get_ad_signup_funnel", {
    p_windows: windows.map((window) => ({
      signup_source: window.signupSource,
      from_date: window.fromDate,
      to_date: window.toDate,
    })),
    p_exclude_user_ids: operators,
  });
  if (error) throw new Error(`登録の人数の取得に失敗しました: ${error.message}`);
  for (const row of (data ?? []) as Array<{
    signup_source: string;
    signups: number | string;
    generated: number | string;
    posted: number | string;
  }>) {
    funnel.set(row.signup_source, {
      signups: Number(row.signups),
      generated: Number(row.generated),
      posted: Number(row.posted),
    });
  }
  return funnel;
}

/**
 * 目印の候補（最近の登録に付いていた目印と、広告に選んである目印）。
 * 入力の手助けなので、読めなくても画面は出す（選んである目印だけにする）。
 */
async function listSignupSourceOptions(
  supabase: SupabaseClient,
  chosen: string[],
): Promise<string[]> {
  const since = new Date(Date.now() - SIGNUP_SOURCE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase.rpc("list_recent_signup_sources", { p_since: since });
  if (error) {
    console.error("[admin ad-stats] signup source options:", error.message);
  }
  const recent = ((data ?? []) as Array<{ signup_source: string }>).map((row) => row.signup_source);
  return [...new Set([...recent, ...chosen])].sort();
}

export interface AdStatsOverview extends AdStatsSummary {
  signupSourceOptions: string[];
}

export async function getAdStatsOverview(client?: SupabaseClient): Promise<AdStatsOverview> {
  const supabase = getSupabase(client);
  const [statRows, adRows] = await Promise.all([listStatRows(supabase), listAds(supabase)]);

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
    adRows.map((row) => ({
      platform: row.platform,
      adKey: row.ad_key,
      adName: row.ad_name,
      signupSource: row.signup_source,
    })),
  );
  const chosen = [
    ...new Set(adRows.map((row) => row.signup_source).filter((s): s is string => !!s)),
  ];
  const [funnel, signupSourceOptions] = await Promise.all([
    getFunnelBySource(supabase, signupWindows(summary.ads)),
    listSignupSourceOptions(supabase, chosen),
  ]);
  return { ...attachFunnel(summary, funnel), signupSourceOptions };
}
