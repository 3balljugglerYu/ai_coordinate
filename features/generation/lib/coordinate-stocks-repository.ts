import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface CoordinateStocksUnreadState {
  hasDot: boolean;
  latestStockCreatedAt: string | null;
}

export interface LinkStockToJobsResult {
  updatedJobIds: string[];
  updatedGeneratedImageIds: string[];
}

const MAX_LINK_JOB_IDS = 4;

function getSupabase(client?: SupabaseClient) {
  return client ?? createAdminClient();
}

function isCreatedAfter(seenAt: string | null, latestCreatedAt: string | null) {
  if (!latestCreatedAt) {
    return false;
  }
  if (!seenAt) {
    return true;
  }
  return new Date(latestCreatedAt).getTime() > new Date(seenAt).getTime();
}

/**
 * ストックタブ未確認状態の判定。
 * profiles.coordinate_stocks_tab_seen_at と source_image_stocks.created_at の最新を比較する。
 */
export async function getCoordinateStocksUnreadStateForUser(
  userId: string,
  client?: SupabaseClient
): Promise<CoordinateStocksUnreadState> {
  const supabase = getSupabase(client);

  const [
    { data: profile, error: profileError },
    { data: latestStock, error: latestError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("coordinate_stocks_tab_seen_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("source_image_stocks")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileError) {
    console.error("[coordinate-stocks] unread state profile error:", profileError);
    throw new Error("ストックの未確認状態の取得に失敗しました");
  }

  if (latestError) {
    console.error("[coordinate-stocks] unread state latest error:", latestError);
    throw new Error("ストックの未確認状態の取得に失敗しました");
  }

  const latestStockCreatedAt =
    typeof latestStock?.created_at === "string" ? latestStock.created_at : null;
  const seenAt =
    typeof profile?.coordinate_stocks_tab_seen_at === "string"
      ? profile.coordinate_stocks_tab_seen_at
      : null;

  return {
    hasDot: isCreatedAfter(seenAt, latestStockCreatedAt),
    latestStockCreatedAt,
  };
}

/**
 * ストックタブを開いたタイミングで `coordinate_stocks_tab_seen_at` を now() に更新する。
 * profiles 行が無い場合は INSERT する（announcements 側の seen API と同じ振る舞い）。
 */
export async function markCoordinateStocksTabSeenForUser(
  userId: string,
  client?: SupabaseClient
): Promise<string> {
  const supabase = getSupabase(client);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("profiles")
    .update({
      coordinate_stocks_tab_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    console.error("[coordinate-stocks] mark seen update error:", error);
    throw new Error("ストックタブの既読状態の更新に失敗しました");
  }

  if (!data?.length) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      user_id: userId,
      coordinate_stocks_tab_seen_at: nowIso,
      updated_at: nowIso,
    });

    if (insertError) {
      console.error("[coordinate-stocks] mark seen insert error:", insertError);
      throw new Error("ストックタブの既読状態の更新に失敗しました");
    }
  }

  return nowIso;
}

/**
 * 指定 stockId を、所有 image_jobs（と紐づく generated_images）の source_image_stock_id に書き戻す。
 * generated_images.job_id は存在しないため、image_jobs.result_image_url と
 * generated_images.image_url が一致する行だけを best-effort で更新する。
 */
export async function linkStockToImageJobsForUser(params: {
  userId: string;
  stockId: string;
  jobIds: string[];
  client?: SupabaseClient;
}): Promise<LinkStockToJobsResult | { error: "stock_not_found" | "too_many_jobs" }> {
  const { userId, stockId, jobIds } = params;
  const supabase = getSupabase(params.client);

  if (jobIds.length === 0) {
    return { updatedJobIds: [], updatedGeneratedImageIds: [] };
  }

  if (jobIds.length > MAX_LINK_JOB_IDS) {
    return { error: "too_many_jobs" };
  }

  // 1) stock の所有確認
  const { data: stock, error: stockError } = await supabase
    .from("source_image_stocks")
    .select("id")
    .eq("id", stockId)
    .eq("user_id", userId)
    .maybeSingle();

  if (stockError) {
    console.error("[coordinate-stocks] link stock fetch error:", stockError);
    throw new Error("ストックの紐づけに失敗しました");
  }

  if (!stock) {
    return { error: "stock_not_found" };
  }

  // 2) 対象 image_jobs を所有/未紐づけ条件で取得（result_image_url を集めるため）
  const { data: targetJobs, error: targetJobsError } = await supabase
    .from("image_jobs")
    .select("id, result_image_url, source_image_stock_id")
    .eq("user_id", userId)
    .in("id", jobIds);

  if (targetJobsError) {
    console.error("[coordinate-stocks] link stock jobs fetch error:", targetJobsError);
    throw new Error("ストックの紐づけに失敗しました");
  }

  const linkableJobs = (targetJobs ?? []).filter(
    (row): row is { id: string; result_image_url: string | null; source_image_stock_id: string | null } =>
      row.source_image_stock_id == null
  );

  if (linkableJobs.length === 0) {
    return { updatedJobIds: [], updatedGeneratedImageIds: [] };
  }

  // 3) image_jobs を一括 UPDATE（IS NULL ガードで冪等）
  const linkableJobIds = linkableJobs.map((row) => row.id);
  const { data: updatedJobs, error: updateJobsError } = await supabase
    .from("image_jobs")
    .update({ source_image_stock_id: stockId })
    .in("id", linkableJobIds)
    .eq("user_id", userId)
    .is("source_image_stock_id", null)
    .select("id");

  if (updateJobsError) {
    console.error("[coordinate-stocks] link stock jobs update error:", updateJobsError);
    throw new Error("ストックの紐づけに失敗しました");
  }

  // 4) generated_images は image_url 一致で best-effort 更新
  const resultImageUrls = linkableJobs
    .map((row) => row.result_image_url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);

  let updatedGeneratedImageIds: string[] = [];
  if (resultImageUrls.length > 0) {
    const { data: updatedImages, error: updateImagesError } = await supabase
      .from("generated_images")
      .update({ source_image_stock_id: stockId })
      .eq("user_id", userId)
      .in("image_url", resultImageUrls)
      .is("source_image_stock_id", null)
      .select("id");

    if (updateImagesError) {
      // ログのみ。stock 自体は維持。
      console.warn(
        "[coordinate-stocks] link stock generated_images update warning:",
        updateImagesError
      );
    } else {
      updatedGeneratedImageIds =
        updatedImages?.map((row) => row.id as string) ?? [];
    }
  }

  return {
    updatedJobIds: updatedJobs?.map((row) => row.id as string) ?? [],
    updatedGeneratedImageIds,
  };
}

export const COORDINATE_STOCKS_LINK_MAX_JOBS = MAX_LINK_JOB_IDS;
