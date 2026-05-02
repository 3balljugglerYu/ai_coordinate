import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";
import { COMMENT_MAX_LENGTH } from "@/constants";
import type {
  CommentDeleteResult,
  ParentComment,
  Post,
  ReplyComment,
  SortType,
} from "../types";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { redactSensitivePrompt } from "@/features/generation/lib/prompt-visibility";
import { getImageDimensions, getPostImageUrl } from "./utils";
import {
  ensureImageDimensions,
  type ImageRowSubset,
} from "./ensure-image-dimensions";
import {
  getJSTStartOfDay,
  getJSTEndOfDay,
  getJSTYesterdayStart,
  getJSTYesterdayEnd,
  getJSTLastWeekStart,
  getJSTLastWeekEnd,
  getJSTLastMonthStart,
  getJSTLastMonthEnd,
} from "./date-utils";

/**
 * 投稿機能のサーバーサイドAPI関数
 */

export type LikeRange = "all" | "day" | "week" | "month";

type CommentRow = {
  id: string;
  user_id: string | null;
  image_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_activity_at?: string | null;
};

type ParentCommentLookupRow = Pick<
  CommentRow,
  "id" | "image_id" | "parent_comment_id" | "deleted_at"
>;

const COMMENT_SELECT_COLUMNS = [
  "id",
  "user_id",
  "image_id",
  "parent_comment_id",
  "content",
  "created_at",
  "updated_at",
  "deleted_at",
  "last_activity_at",
].join(",");

export class PostCommentError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "PostCommentError";
  }
}

function validateCommentContent(content: string): string {
  const sanitized = sanitizeProfileText(content);
  const validation = validateProfileText(
    sanitized.value,
    COMMENT_MAX_LENGTH,
    "コメント",
    false
  );

  if (!validation.valid) {
    throw new PostCommentError(
      validation.error || "コメントのバリデーションに失敗しました",
      400,
      "POSTS_COMMENT_INVALID_INPUT"
    );
  }

  return sanitized.value;
}

function toParentComment(
  comment: CommentRow,
  profileMap: Record<string, { nickname: string | null; avatar_url: string | null }>,
  replyCount: number,
  deletedCommentPlaceholder: string
): ParentComment {
  if (comment.deleted_at) {
    return {
      id: comment.id,
      user_id: null,
      image_id: comment.image_id,
      parent_comment_id: null,
      content: deletedCommentPlaceholder,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      deleted_at: comment.deleted_at,
      last_activity_at: comment.last_activity_at ?? comment.created_at,
      reply_count: replyCount,
      user_nickname: null,
      user_avatar_url: null,
    };
  }

  return {
    id: comment.id,
    user_id: comment.user_id,
    image_id: comment.image_id,
    parent_comment_id: null,
    content: comment.content,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    deleted_at: null,
    last_activity_at: comment.last_activity_at ?? comment.created_at,
    reply_count: replyCount,
    user_nickname: comment.user_id ? profileMap[comment.user_id]?.nickname ?? null : null,
    user_avatar_url: comment.user_id ? profileMap[comment.user_id]?.avatar_url ?? null : null,
  };
}

function toReplyComment(
  comment: CommentRow,
  profileMap: Record<string, { nickname: string | null; avatar_url: string | null }>
): ReplyComment {
  return {
    id: comment.id,
    user_id: comment.user_id,
    image_id: comment.image_id,
    parent_comment_id: comment.parent_comment_id || "",
    content: comment.content,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    deleted_at: comment.deleted_at,
    user_nickname: comment.user_id ? profileMap[comment.user_id]?.nickname ?? null : null,
    user_avatar_url: comment.user_id ? profileMap[comment.user_id]?.avatar_url ?? null : null,
  };
}

function mapDeleteCommentRpcError(errorMessage: string): PostCommentError | null {
  if (errorMessage.includes("Comment not found")) {
    return new PostCommentError(
      "コメントが見つかりません",
      404,
      "POSTS_COMMENT_NOT_FOUND"
    );
  }

  if (
    errorMessage.includes("Not authorized") ||
    errorMessage.includes("Unauthorized")
  ) {
    return new PostCommentError(
      "コメントを削除する権限がありません",
      403,
      "POSTS_COMMENT_FORBIDDEN"
    );
  }

  if (errorMessage.includes("already deleted")) {
    return new PostCommentError(
      "削除済みコメントは操作できません",
      409,
      "POSTS_COMMENT_ALREADY_DELETED"
    );
  }

  return null;
}

/**
 * プロフィール情報を一括取得するヘルパー関数
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
async function getProfileMap(
  userIds: string[],
  supabaseOverride?: SupabaseClient
): Promise<
  Record<
    string,
    {
      nickname: string | null;
      avatar_url: string | null;
      subscription_plan: "free" | "light" | "standard" | "premium";
    }
  >
> {
  const profileMap: Record<
    string,
    {
      nickname: string | null;
      avatar_url: string | null;
      subscription_plan: "free" | "light" | "standard" | "premium";
    }
  > = {};
  
  if (userIds.length === 0) {
    return profileMap;
  }

  const supabase = supabaseOverride ?? (await createClient());
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id,nickname,avatar_url,subscription_plan")
    .in("user_id", userIds);

  if (profilesError) {
    console.error("Profile fetch error:", profilesError);
    return profileMap;
  }

  if (profiles) {
    for (const profile of profiles) {
      profileMap[profile.user_id] = {
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
        subscription_plan: profile.subscription_plan ?? "free",
      };
    }
  }

  return profileMap;
}

async function getVisibilityExclusions(
  currentUserId?: string | null,
  supabaseOverride?: SupabaseClient
): Promise<{
  blockedUserIds: string[];
  reportedPostIds: string[];
}> {
  if (!currentUserId) {
    return {
      blockedUserIds: [],
      reportedPostIds: [],
    };
  }

  const supabase = supabaseOverride ?? (await createClient());
  const [{ data: blockRows, error: blockError }, { data: reportRows, error: reportError }] =
    await Promise.all([
      supabase
        .from("user_blocks")
        .select("blocker_id,blocked_id")
        .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`),
      supabase
        .from("post_reports")
        .select("post_id")
        .eq("reporter_id", currentUserId),
    ]);

  if (blockError) {
    console.error("Block relation fetch error:", blockError);
  }
  if (reportError) {
    console.error("Reported posts fetch error:", reportError);
  }

  const blockedUserIds = new Set<string>();
  (blockRows || []).forEach((row) => {
    if (row.blocker_id === currentUserId && row.blocked_id) {
      blockedUserIds.add(row.blocked_id);
    } else if (row.blocked_id === currentUserId && row.blocker_id) {
      blockedUserIds.add(row.blocker_id);
    }
  });

  return {
    blockedUserIds: [...blockedUserIds],
    reportedPostIds: (reportRows || [])
      .map((row) => row.post_id)
      .filter((postId): postId is string => Boolean(postId)),
  };
}

function toSqlInList(values: string[]): string {
  return `(${values.map((value) => `"${value.replace(/"/g, "")}"`).join(",")})`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * フィードクエリに使う moderation_status の OR フィルタ式を組み立てる。
 * - 本人: visible 全件 + 自分の pending（removed は除外）
 * - その他: visible のみ
 * `null` を返した場合、呼び出し側で `.eq("moderation_status", "visible")` を使う。
 */
function buildOwnerVisibleOrFilter(currentUserId: string | null): string | null {
  if (currentUserId && UUID_RE.test(currentUserId)) {
    return `moderation_status.eq.visible,and(moderation_status.eq.pending,user_id.eq.${currentUserId})`;
  }
  return null;
}

/**
 * 投稿データにユーザー情報・いいね数・コメント数を付与するヘルパー関数
 * @param postsData 投稿データの配列
 * @param rangeLikeCounts 期間別いいね数（オプショナル、daily/week/monthの場合のみ）
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
async function enrichPosts(
  postsData: GeneratedImageRecord[],
  rangeLikeCounts?: Record<string, number>,
  supabaseOverride?: SupabaseClient
): Promise<Array<Post & { range_like_count?: number }>> {
  if (!postsData || postsData.length === 0) {
    return [];
  }

  // 投稿IDを抽出（idが存在するもののみ）
  const postIds = postsData
    .map((post) => post.id)
    .filter((id): id is string => Boolean(id));

  // ユーザーIDをユニークに抽出
  const userIds = Array.from(
    new Set(
      postsData
        .map((post) => post.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  // プロフィール情報を一括取得
  const profileMap = await getProfileMap(userIds, supabaseOverride);

  // いいね数・コメント数を一括取得（バッチ取得）
  const [likeCounts, commentCounts] = await Promise.all([
    getLikeCountsBatch(postIds, supabaseOverride),
    getCommentCountsBatch(postIds, supabaseOverride),
  ]);

  // 投稿データにユーザー情報・いいね数・コメント数を結合
  return postsData.map((post) => {
    const safePost = redactSensitivePrompt(post);
    const profile = safePost.user_id ? profileMap[safePost.user_id] : undefined;
    const postId = safePost.id || "";

    return {
      ...safePost,
      user: safePost.user_id
        ? {
            id: safePost.user_id,
            email: undefined, // Phase 5で実装予定
            nickname: profile?.nickname ?? null,
            avatar_url: profile?.avatar_url ?? null,
            subscription_plan: profile?.subscription_plan ?? "free",
          }
        : null,
      like_count: likeCounts[postId] || 0,
      comment_count: commentCounts[postId] || 0,
      view_count: safePost.view_count || 0,
      range_like_count: rangeLikeCounts ? rangeLikeCounts[postId] || 0 : undefined,
    };
  });
}

/**
 * 投稿済み画像一覧を取得（サーバーサイド専用）
 */
async function getPostedImages(
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("is_posted", true)
    .order("posted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`投稿画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * 投稿一覧を取得（サーバーサイド）
 * SQL JOIN/サブクエリでいいね数・コメント数を一括取得（N+1問題を回避）
 * React.cache()でラップして、同一リクエスト内での重複取得を防止
 * @param currentUserIdOverride - use cache 用。指定時は getUser() をスキップ
 */
export const getPosts = cache(async (
  limit = 20,
  offset = 0,
  sort: SortType = "newest",
  searchQuery?: string,
  currentUserIdOverride?: string | null
): Promise<Post[]> => {
  // use cache 内では cookies を使わないため createAdminClient を使用
  const useCacheClient = currentUserIdOverride !== undefined;
  const supabase = useCacheClient ? createAdminClient() : await createClient();
  const currentUserId =
    currentUserIdOverride !== undefined
      ? currentUserIdOverride
      : (await getUser())?.id ?? null;

  // 検索クエリのバリデーションと正規化
  let normalizedSearchQuery: string | undefined = undefined;
  if (searchQuery) {
    const trimmed = searchQuery.trim();
    if (trimmed.length > 0) {
      // 最大長100文字に制限
      if (trimmed.length > 100) {
        throw new Error("検索クエリは100文字以内で入力してください");
      }
      normalizedSearchQuery = trimmed;
    }
  }

  const supabaseForHelpers = useCacheClient ? supabase : undefined;
  const { blockedUserIds, reportedPostIds } = await getVisibilityExclusions(
    currentUserId,
    supabaseForHelpers
  );

  // フォロータブの場合の処理
  if (sort === "following") {
    // 未認証ユーザーの場合は空配列を返す
    if (!currentUserId) {
      return [];
    }

    // フォローしているユーザーIDのリストを取得
    const { data: follows, error: followsError } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", currentUserId);

    if (followsError) {
      console.error("Follows fetch error:", followsError);
      return [];
    }

    // フォローしているユーザーが0人の場合は空配列を返す
    if (!follows || follows.length === 0) {
      return [];
    }

    const followedUserIds = follows.map((f) => f.followee_id);

    // フォローしているユーザーが投稿した画像のみを取得
    // データベース側でページネーションを適用（posted_atでソートするだけなので効率的）
    let followingQuery = supabase
      .from("generated_images")
      .select("*")
      .eq("is_posted", true)
      .in("user_id", followedUserIds);

    const followingOwnerOr = buildOwnerVisibleOrFilter(currentUserId);
    followingQuery = followingOwnerOr
      ? followingQuery.or(followingOwnerOr)
      : followingQuery.eq("moderation_status", "visible");

    if (blockedUserIds.length > 0) {
      followingQuery = followingQuery.not("user_id", "in", toSqlInList(blockedUserIds));
    }
    if (reportedPostIds.length > 0) {
      followingQuery = followingQuery.not("id", "in", toSqlInList(reportedPostIds));
    }

    // 検索クエリが指定されている場合、プロンプト文を検索
    if (normalizedSearchQuery) {
      followingQuery = followingQuery.ilike("prompt", `%${normalizedSearchQuery}%`);
    }

    const { data: postsData, error: postsError } = await followingQuery
      .order("posted_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (postsError) {
      console.error("Database query error:", postsError);
      throw new Error(`投稿画像の取得に失敗しました: ${postsError.message}`);
    }

    // 投稿データにユーザー情報・いいね数・コメント数を付与
    // データベース側で既にページネーション済みなので、そのまま返す
    return await enrichPosts(postsData, undefined, supabaseForHelpers);
  }

  // 投稿一覧を取得するクエリを構築
  let postsQuery = supabase
    .from("generated_images")
    .select("*")
    .eq("is_posted", true);

  const ownerOr = buildOwnerVisibleOrFilter(currentUserId);
  postsQuery = ownerOr
    ? postsQuery.or(ownerOr)
    : postsQuery.eq("moderation_status", "visible");

  if (blockedUserIds.length > 0) {
    postsQuery = postsQuery.not("user_id", "in", toSqlInList(blockedUserIds));
  }
  if (reportedPostIds.length > 0) {
    postsQuery = postsQuery.not("id", "in", toSqlInList(reportedPostIds));
  }

  // 検索クエリが指定されている場合、プロンプト文を検索
  if (normalizedSearchQuery) {
    postsQuery = postsQuery.ilike("prompt", `%${normalizedSearchQuery}%`);
  }

  // 期間別ソートの場合は、その期間に投稿されたもののみをフィルタリング
  // posted_atがnullのレコードを除外
  if (sort === "daily") {
    // Daily: 昨日に投稿されたもののみ
    const jstYesterdayStart = getJSTYesterdayStart();
    const jstYesterdayEnd = getJSTYesterdayEnd();
    postsQuery = postsQuery
      .not("posted_at", "is", null)
      .gte("posted_at", jstYesterdayStart.toISOString())
      .lte("posted_at", jstYesterdayEnd.toISOString());
  } else if (sort === "week") {
    // Week: 先週に投稿されたもののみ
    const jstLastWeekStart = getJSTLastWeekStart();
    const jstLastWeekEnd = getJSTLastWeekEnd();
    postsQuery = postsQuery
      .not("posted_at", "is", null)
      .gte("posted_at", jstLastWeekStart.toISOString())
      .lte("posted_at", jstLastWeekEnd.toISOString());
  } else if (sort === "month") {
    // Month: 先月に投稿されたもののみ
    const jstLastMonthStart = getJSTLastMonthStart();
    const jstLastMonthEnd = getJSTLastMonthEnd();
    postsQuery = postsQuery
      .not("posted_at", "is", null)
      .gte("posted_at", jstLastMonthStart.toISOString())
      .lte("posted_at", jstLastMonthEnd.toISOString());
  }

  // 新着順で取得（期間別ソートの場合は、その期間内で新着順）
  // popularソートの場合は全件取得してからソートするため、limit(1000)で取得
  postsQuery = postsQuery.order("posted_at", { ascending: false });
  
  // 新着タブの場合はデータベース側でページネーションを適用
  // daily/week/month/popularの場合はソート後にページネーションを適用するため、limit(1000)で取得
  if (sort === "newest") {
    postsQuery = postsQuery.range(offset, offset + limit - 1);
  } else {
    postsQuery = postsQuery.limit(1000);
  }

  const { data: postsData, error: postsError } = await postsQuery;

  if (postsError) {
    console.error("Database query error:", postsError);
    throw new Error(`投稿画像の取得に失敗しました: ${postsError.message}`);
  }

  if (!postsData || postsData.length === 0) {
    return [];
  }

  // 期間別のいいね数を取得（daily/week/monthの場合）
  // popularソートの場合は全期間のいいね数を使用（enrichPostsで取得済み）
  // N+1問題を解消するため、バッチ処理で一括取得
  let rangeLikeCounts: Record<string, number> | undefined = undefined;
  if (sort !== "newest" && sort !== "popular") {
    // sort型をLikeRange型にマッピング
    const rangeMap: Record<"daily" | "week" | "month", LikeRange> = {
      daily: "day",
      week: "week",
      month: "month",
    };
    const likeRange = rangeMap[sort as "daily" | "week" | "month"];
    
    // 投稿IDのリストを取得
    const postIds = postsData.map((post) => post.id);
    
    // バッチ処理で一括取得（N+1問題の解消）
    rangeLikeCounts = await getLikeCountsByRangeBatch(
      postIds,
      likeRange,
      supabaseForHelpers
    );
  }

  // 投稿データにユーザー情報・いいね数・コメント数を付与
  const postsWithCounts = await enrichPosts(
    postsData,
    rangeLikeCounts,
    supabaseForHelpers
  );

  // ソート条件に応じてソート
  if (sort === "newest") {
    // 新着順は既にソート済み、データベース側でページネーション済み
    // そのまま返す（range_like_countを除外）
    return postsWithCounts.map((post) => {
      const { range_like_count, ...postWithoutRangeLikeCount } = post;
      return postWithoutRangeLikeCount;
    });
  } else if (sort === "popular") {
    // popularソートの場合は、全期間のいいね数（like_count）でソート
    // いいね数でソート（降順）
    const sortedPosts = postsWithCounts.toSorted((a, b) => {
      const aCount = a.like_count || 0;
      const bCount = b.like_count || 0;
      if (bCount !== aCount) {
        return bCount - aCount; // 降順
      }
      // いいね数が同じ場合は、投稿日時でソート（降順）
      const aPostedAt = a.posted_at || a.created_at || "";
      const bPostedAt = b.posted_at || b.created_at || "";
      return new Date(bPostedAt).getTime() - new Date(aPostedAt).getTime();
    });
    
    // ページネーション適用（サーバー側でソート後）
    const paginatedPosts = sortedPosts.slice(offset, offset + limit);
    
    // range_like_countを除外して返す
    return paginatedPosts.map((post) => {
      const { range_like_count, ...postWithoutRangeLikeCount } = post;
      return postWithoutRangeLikeCount;
    });
  } else {
    // daily/week/monthの場合は、期間別いいね数でソート
    // いいね数0の投稿を除外
    const filteredPosts = postsWithCounts.filter((post) => (post.range_like_count || 0) > 0);
    
    // 期間別いいね数でソート（降順）
    const sortedPosts = filteredPosts.toSorted((a, b) => {
      const aCount = a.range_like_count || 0;
      const bCount = b.range_like_count || 0;
      if (bCount !== aCount) {
        return bCount - aCount; // 降順
      }
      // いいね数が同じ場合は、投稿日時でソート（降順）
      const aPostedAt = a.posted_at || a.created_at || "";
      const bPostedAt = b.posted_at || b.created_at || "";
      return new Date(bPostedAt).getTime() - new Date(aPostedAt).getTime();
    });
    
    // ページネーション適用（サーバー側でソート後）
    const paginatedPosts = sortedPosts.slice(offset, offset + limit);
    
    // range_like_countを除外して返す
    return paginatedPosts.map((post) => {
      const { range_like_count, ...postWithoutRangeLikeCount } = post;
      return postWithoutRangeLikeCount;
    });
  }
});

/**
 * 投稿詳細を取得（サーバーサイド）
 * 投稿済み画像は全ユーザーが閲覧可能、未投稿画像は所有者または管理者のみ閲覧可能
 * いいね数・コメント数・閲覧数を取得し、閲覧数をインクリメント
 * React.cache()でラップして、同一リクエスト内での重複取得を防止
 */
export const getPost = cache(async (
  id: string,
  currentUserId?: string | null,
  skipViewCount?: boolean,
  supabaseOverride?: SupabaseClient
): Promise<Post | null> => {
  const supabase = supabaseOverride ?? (await createClient());
  const useCache = !!supabaseOverride;
  const isAdminViewer = !!currentUserId && getAdminUserIds().includes(currentUserId);

  // まず画像を取得（is_postedの条件なし）
  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  const isPostOwner = !!currentUserId && data.user_id === currentUserId;

  // 投稿済みの場合は全ユーザーが閲覧可能
  // 未投稿の場合は所有者または管理者のみ閲覧可能
  if (!data.is_posted && !isPostOwner && !isAdminViewer) {
    return null;
  }

  if (
    data.is_posted &&
    data.moderation_status &&
    data.moderation_status !== "visible" &&
    !isAdminViewer
  ) {
    // 投稿者本人は自分の pending 投稿を閲覧できる（フィードから消えていることに気づかせる）。
    // ただし removed は本人にも表示しない。
    const isOwnerPending =
      isPostOwner && data.moderation_status === "pending";
    if (!isOwnerPending) {
      return null;
    }
  }

  if (currentUserId && data.user_id && !isAdminViewer) {
    const [{ data: blockAsBlocker }, { data: blockAsBlocked }, { data: reportRow }] =
      await Promise.all([
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", currentUserId)
          .eq("blocked_id", data.user_id)
          .maybeSingle(),
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", data.user_id)
          .eq("blocked_id", currentUserId)
          .maybeSingle(),
        supabase
          .from("post_reports")
          .select("id")
          .eq("reporter_id", currentUserId)
          .eq("post_id", data.id)
          .maybeSingle(),
      ]);

    if (blockAsBlocker || blockAsBlocked || reportRow) {
      return null;
    }
  }

  // プロフィール情報を取得（別クエリ）
  let profile: {
    nickname: string | null;
    avatar_url: string | null;
    subscription_plan: "free" | "light" | "standard" | "premium";
  } | null = null;
  if (data.user_id) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("user_id,nickname,avatar_url,subscription_plan")
      .eq("user_id", data.user_id)
      .single();

    if (!profileError && profileData) {
      profile = {
        nickname: profileData.nickname,
        avatar_url: profileData.avatar_url,
        subscription_plan: profileData.subscription_plan ?? "free",
      };
    }
  }

  // いいね数・コメント数を取得
  const [likeCount, commentCount] = useCache
    ? await Promise.all([
        getLikeCountsBatch([id], supabase).then((m) => m[id] ?? 0),
        getCommentCountsBatch([id], supabase).then((m) => m[id] ?? 0),
      ])
    : await Promise.all([
        getLikeCount(id),
        getCommentCount(id),
      ]);

  // 実寸が未計算の場合は lazy compute で算出して DB に書き戻す。
  // 詳細は features/posts/lib/ensure-image-dimensions.ts。
  const { width, height } = await ensureImageDimensions({
    data: data as ImageRowSubset,
    useCache,
    fetchDimensions: getImageDimensions,
    resolveImageUrl: (row) => getPostImageUrl(row) || null,
    updateRow: async (updates) => {
      await supabase
        .from("generated_images")
        .update(updates)
        .eq("id", id);
    },
  });

  // 閲覧数をインクリメント（重複カウント）
  // skipViewCountがtrue、またはuse cache時はカウントをスキップ
  const currentViewCount = data.view_count || 0;
  let updatedViewCount = currentViewCount;
  
  if (!skipViewCount && !useCache) {
    try {
      // オプティミスティック更新: 現在の閲覧数+1を使用（RPC関数の戻り値取得を待たない）
      await incrementViewCount(id);
      
      // 更新後の閲覧数を取得（オプティミスティック更新のため、実際の値ではなく現在の値+1を使用）
      // 注意: 実際の値が必要な場合は、RPC関数を修正して戻り値を返すようにする
      updatedViewCount = currentViewCount + 1;
    } catch (error) {
      // 閲覧数の更新に失敗した場合でも、ページの表示は続行する
      // エラーはログに記録するが、ページの読み込みは妨げない
      console.error("Failed to increment view count, continuing without update:", error);
      // 閲覧数は現在の値のまま（更新しない）
    }
  }

  return redactSensitivePrompt({
    ...data,
    user: data.user_id
      ? {
          id: data.user_id,
          email: undefined, // Phase 5で実装予定
          nickname: profile?.nickname ?? null,
          avatar_url: profile?.avatar_url ?? null,
          subscription_plan: profile?.subscription_plan ?? "free",
        }
      : null,
    like_count: likeCount,
    comment_count: commentCount,
    view_count: updatedViewCount,
    width,
    height,
  });
});

/**
 * いいね数を取得（単一）
 */
export async function getLikeCount(imageId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("image_id", imageId);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の取得に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * いいね数を一括取得（バッチ、最大100件）
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getLikeCountsBatch(
  imageIds: string[],
  supabaseOverride?: SupabaseClient
): Promise<Record<string, number>> {
  if (imageIds.length === 0) {
    return {};
  }

  if (imageIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .from("likes")
    .select("image_id")
    .in("image_id", imageIds);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の一括取得に失敗しました: ${error.message}`);
  }

  // 集計
  const counts: Record<string, number> = {};
  imageIds.forEach((id) => {
    counts[id] = 0;
  });

  data?.forEach((like) => {
    if (like.image_id) {
      counts[like.image_id] = (counts[like.image_id] || 0) + 1;
    }
  });

  return counts;
}

/**
 * ユーザーのいいね状態を取得
 */
export async function getUserLikeStatus(imageId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("likes")
    .select("id")
    .eq("image_id", imageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね状態の取得に失敗しました: ${error.message}`);
  }

  return !!data;
}

/**
 * ユーザーのいいね状態を一括取得（バッチ）
 */
export async function getUserLikeStatusesBatch(
  imageIds: string[],
  userId: string
): Promise<Record<string, boolean>> {
  if (imageIds.length === 0) {
    return {};
  }

  if (imageIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("likes")
    .select("image_id")
    .in("image_id", imageIds)
    .eq("user_id", userId);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね状態の一括取得に失敗しました: ${error.message}`);
  }

  const statuses: Record<string, boolean> = {};
  imageIds.forEach((id) => {
    statuses[id] = false;
  });

  data?.forEach((like) => {
    if (like.image_id) {
      statuses[like.image_id] = true;
    }
  });

  return statuses;
}

/**
 * いいねの追加・削除（トグル）
 */
export async function toggleLike(imageId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  // 既存のいいねを確認
  const existing = await getUserLikeStatus(imageId, userId);

  if (existing) {
    // いいねを削除
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("image_id", imageId)
      .eq("user_id", userId);

    if (error) {
      console.error("Database query error:", error);
      throw new Error(`いいねの削除に失敗しました: ${error.message}`);
    }

    return false;
  } else {
    // いいねを追加
    const { error } = await supabase.from("likes").insert({
      image_id: imageId,
      user_id: userId,
    });

    if (error) {
      console.error("Database query error:", error);
      throw new Error(`いいねの追加に失敗しました: ${error.message}`);
    }

    return true;
  }
}

/**
 * 複数の投稿IDに対して期間別いいね数を一括取得（バッチ処理）
 * N+1問題を解消するため、一度のクエリで複数投稿のいいね数を取得
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getLikeCountsByRangeBatch(
  imageIds: string[],
  range: LikeRange,
  supabaseOverride?: SupabaseClient
): Promise<Record<string, number>> {
  if (imageIds.length === 0) {
    return {};
  }

  const supabase = supabaseOverride ?? (await createClient());

  let query = supabase
    .from("likes")
    .select("image_id")
    .in("image_id", imageIds);

  // JST基準で期間フィルタリング（昨日/先週/先月）
  if (range === "day") {
    // Daily: 昨日のいいねのみ
    const jstYesterdayStart = getJSTYesterdayStart();
    const jstYesterdayEnd = getJSTYesterdayEnd();
    query = query
      .gte("created_at", jstYesterdayStart.toISOString())
      .lte("created_at", jstYesterdayEnd.toISOString());
  } else if (range === "week") {
    // Week: 先週のいいねのみ
    const jstLastWeekStart = getJSTLastWeekStart();
    const jstLastWeekEnd = getJSTLastWeekEnd();
    query = query
      .gte("created_at", jstLastWeekStart.toISOString())
      .lte("created_at", jstLastWeekEnd.toISOString());
  } else if (range === "month") {
    // Month: 先月のいいねのみ
    const jstLastMonthStart = getJSTLastMonthStart();
    const jstLastMonthEnd = getJSTLastMonthEnd();
    query = query
      .gte("created_at", jstLastMonthStart.toISOString())
      .lte("created_at", jstLastMonthEnd.toISOString());
  }
  // range === "all" の場合は期間制限なし

  const { data, error } = await query;

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の一括集計に失敗しました: ${error.message}`);
  }

  // image_idごとに集計
  const counts: Record<string, number> = {};
  // 初期化：すべての投稿IDに対して0を設定
  imageIds.forEach((id) => {
    counts[id] = 0;
  });
  // いいねがある投稿のカウントを増やす
  data?.forEach((like) => {
    if (like.image_id) {
      counts[like.image_id] = (counts[like.image_id] || 0) + 1;
    }
  });

  return counts;
}

/**
 * いいね数を期間別に集計（単一投稿用）
 * 単一投稿の詳細画面などで使用される
 * @param imageId 投稿ID
 * @param range 集計期間（"all" | "day" | "week" | "month"）
 * @returns いいね数
 */
export async function getLikeCountInRange(
  imageId: string,
  range: LikeRange
): Promise<number> {
  const supabase = await createClient();

  let query = supabase.from("likes").select("*", { count: "exact", head: true }).eq("image_id", imageId);

  // JST基準で期間フィルタリング（昨日/先週/先月）
  if (range === "day") {
    // Daily: 昨日のいいねのみ
    const jstYesterdayStart = getJSTYesterdayStart();
    const jstYesterdayEnd = getJSTYesterdayEnd();
    query = query
      .gte("created_at", jstYesterdayStart.toISOString())
      .lte("created_at", jstYesterdayEnd.toISOString());
  } else if (range === "week") {
    // Week: 先週のいいねのみ
    const jstLastWeekStart = getJSTLastWeekStart();
    const jstLastWeekEnd = getJSTLastWeekEnd();
    query = query
      .gte("created_at", jstLastWeekStart.toISOString())
      .lte("created_at", jstLastWeekEnd.toISOString());
  } else if (range === "month") {
    // Month: 先月のいいねのみ
    const jstLastMonthStart = getJSTLastMonthStart();
    const jstLastMonthEnd = getJSTLastMonthEnd();
    query = query
      .gte("created_at", jstLastMonthStart.toISOString())
      .lte("created_at", jstLastMonthEnd.toISOString());
  }
  // range === "all" の場合は期間制限なし

  const { count, error } = await query;

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の集計に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * コメント数を取得（単一）
 */
export async function getCommentCount(imageId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("image_id", imageId)
    .is("parent_comment_id", null)
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメント数の取得に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * コメント数を一括取得（バッチ、最大100件）
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getCommentCountsBatch(
  imageIds: string[],
  supabaseOverride?: SupabaseClient
): Promise<Record<string, number>> {
  if (imageIds.length === 0) {
    return {};
  }

  if (imageIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .from("comments")
    .select("image_id")
    .in("image_id", imageIds)
    .is("parent_comment_id", null)
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメント数の一括取得に失敗しました: ${error.message}`);
  }

  // 集計
  const counts: Record<string, number> = {};
  imageIds.forEach((id) => {
    counts[id] = 0;
  });

  data?.forEach((comment) => {
    if (comment.image_id) {
      counts[comment.image_id] = (counts[comment.image_id] || 0) + 1;
    }
  });

  return counts;
}

export async function getReplyCount(parentCommentId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("parent_comment_id", parentCommentId)
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`返信数の取得に失敗しました: ${error.message}`);
  }

  return count || 0;
}

export async function getReplyCountsBatch(
  parentCommentIds: string[],
  supabaseOverride?: SupabaseClient
): Promise<Record<string, number>> {
  if (parentCommentIds.length === 0) {
    return {};
  }

  if (parentCommentIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .from("comments")
    .select("parent_comment_id")
    .in("parent_comment_id", parentCommentIds)
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`返信数の一括取得に失敗しました: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  parentCommentIds.forEach((id) => {
    counts[id] = 0;
  });

  data?.forEach((reply) => {
    if (reply.parent_comment_id) {
      counts[reply.parent_comment_id] = (counts[reply.parent_comment_id] || 0) + 1;
    }
  });

  return counts;
}

/**
 * コメント一覧を取得
 */
export async function getComments(
  imageId: string,
  limit: number,
  offset: number,
  deletedCommentPlaceholder = ""
): Promise<ParentComment[]> {
  const supabase = createAdminClient();

  const { data: commentsData, error: commentsError } = await supabase
    .from("comments")
    .select(COMMENT_SELECT_COLUMNS)
    .eq("image_id", imageId)
    .is("parent_comment_id", null)
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (commentsError) {
    console.error("Database query error:", commentsError);
    throw new Error(`コメントの取得に失敗しました: ${commentsError.message}`);
  }

  const comments = (commentsData ?? []) as unknown as CommentRow[];

  if (comments.length === 0) {
    return [];
  }

  const commentIds = comments.map((comment) => comment.id);
  const userIds = Array.from(
    new Set(
      comments
        .filter((comment) => !comment.deleted_at)
        .map((comment) => comment.user_id)
        .filter((userId): userId is string => Boolean(userId))
    )
  );

  const [profileMap, replyCounts] = await Promise.all([
    getProfileMap(userIds, supabase),
    getReplyCountsBatch(commentIds, supabase),
  ]);

  return comments.map((comment) =>
    toParentComment(
      comment as CommentRow,
      profileMap,
      replyCounts[comment.id] ?? 0,
      deletedCommentPlaceholder
    )
  );
}

export async function getReplies(
  parentCommentId: string,
  limit: number,
  offset: number
): Promise<ReplyComment[]> {
  const supabase = createAdminClient();

  const { data: repliesData, error } = await supabase
    .from("comments")
    .select(COMMENT_SELECT_COLUMNS)
    .eq("parent_comment_id", parentCommentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`返信の取得に失敗しました: ${error.message}`);
  }

  const replies = (repliesData ?? []) as unknown as CommentRow[];

  if (replies.length === 0) {
    return [];
  }

  const userIds = Array.from(
    new Set(
      replies
        .map((reply) => reply.user_id)
        .filter((userId): userId is string => Boolean(userId))
    )
  );
  const profileMap = await getProfileMap(userIds, supabase);

  return replies.map((reply) => toReplyComment(reply as CommentRow, profileMap));
}

/**
 * コメントを投稿
 */
export async function createComment(
  imageId: string,
  userId: string,
  content: string
): Promise<ParentComment> {
  const sanitized = validateCommentContent(content);

  const supabase = await createClient();

  const { data: commentData, error: commentError } = await supabase
    .from("comments")
    .insert({
      image_id: imageId,
      user_id: userId,
      content: sanitized,
    } as never)
    .select(COMMENT_SELECT_COLUMNS)
    .single();

  if (commentError) {
    console.error("Database query error:", commentError);
    throw new Error(`コメントの投稿に失敗しました: ${commentError.message}`);
  }

  const comment = commentData as unknown as CommentRow;
  const profileMap = await getProfileMap([userId], supabase);
  return toParentComment(
    comment,
    profileMap,
    0,
    ""
  );
}

export async function createReply(
  parentCommentId: string,
  userId: string,
  content: string
): Promise<ReplyComment> {
  const sanitized = validateCommentContent(content);
  const adminSupabase = createAdminClient();

  const { data: parentCommentData, error: parentCommentError } = await adminSupabase
    .from("comments")
    .select("id,image_id,parent_comment_id,deleted_at")
    .eq("id", parentCommentId)
    .single();

  const parentComment = parentCommentData as unknown as ParentCommentLookupRow | null;

  if (parentCommentError || !parentComment) {
    throw new PostCommentError(
      "返信先のコメントが見つかりません",
      404,
      "POSTS_REPLY_PARENT_NOT_FOUND"
    );
  }

  if (parentComment.parent_comment_id) {
    throw new PostCommentError(
      "返信は親コメントにのみ投稿できます",
      400,
      "POSTS_REPLY_PARENT_INVALID"
    );
  }

  if (parentComment.deleted_at) {
    throw new PostCommentError(
      "削除済みコメントには返信できません",
      409,
      "POSTS_REPLY_PARENT_DELETED"
    );
  }

  const supabase = await createClient();
  const { data: replyData, error: replyError } = await supabase
    .from("comments")
    .insert({
      image_id: parentComment.image_id,
      user_id: userId,
      parent_comment_id: parentCommentId,
      content: sanitized,
    } as never)
    .select(COMMENT_SELECT_COLUMNS)
    .single();

  if (replyError) {
    console.error("Database query error:", replyError);
    throw new Error(`返信の投稿に失敗しました: ${replyError.message}`);
  }

  const reply = replyData as unknown as CommentRow;
  const profileMap = await getProfileMap([userId], supabase);
  return toReplyComment(reply, profileMap);
}

/**
 * コメントを編集
 */
export async function updateComment(
  commentId: string,
  userId: string,
  content: string
): Promise<ParentComment | ReplyComment> {
  const sanitized = validateCommentContent(content);
  const adminSupabase = createAdminClient();
  const { data: existingCommentData, error: existingCommentError } = await adminSupabase
    .from("comments")
    .select("id,user_id,parent_comment_id,deleted_at")
    .eq("id", commentId)
    .single();

  const existingComment = existingCommentData as unknown as CommentRow | null;

  if (existingCommentError || !existingComment) {
    throw new PostCommentError(
      "コメントが見つかりません",
      404,
      "POSTS_COMMENT_NOT_FOUND"
    );
  }

  if (existingComment.user_id !== userId) {
    throw new PostCommentError(
      "コメントを編集する権限がありません",
      403,
      "POSTS_COMMENT_FORBIDDEN"
    );
  }

  if (existingComment.deleted_at) {
    throw new PostCommentError(
      "削除済みコメントは編集できません",
      409,
      "POSTS_COMMENT_ALREADY_DELETED"
    );
  }

  const supabase = await createClient();

  const { data: updatedCommentData, error } = await supabase
    .from("comments")
    .update({
      content: sanitized,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", commentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select(COMMENT_SELECT_COLUMNS)
    .single();

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメントの編集に失敗しました: ${error.message}`);
  }

  const updatedComment = updatedCommentData as unknown as CommentRow | null;

  if (!updatedComment) {
    throw new PostCommentError(
      "コメントが見つかりません",
      404,
      "POSTS_COMMENT_NOT_FOUND"
    );
  }

  if (existingComment.parent_comment_id) {
    const profileMap = await getProfileMap([userId], supabase);
    return toReplyComment(updatedComment, profileMap);
  }

  const profileMap = await getProfileMap([userId], supabase);
  const replyCount = await getReplyCount(commentId);
  return toParentComment(updatedComment, profileMap, replyCount, "");
}

/**
 * コメントを削除（RPC経由の物理/論理削除）
 */
export async function deleteComment(
  commentId: string,
  userId: string
): Promise<CommentDeleteResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || authUser?.id !== userId) {
    throw new PostCommentError(
      "コメントを削除する権限がありません",
      403,
      "POSTS_COMMENT_FORBIDDEN"
    );
  }

  const { data, error } = await supabase.rpc("delete_comment_thread", {
    p_comment_id: commentId,
  });

  if (error) {
    console.error("Database query error:", error);
    const mappedError = mapDeleteCommentRpcError(error.message || "");
    if (mappedError) {
      throw mappedError;
    }
    throw new Error(`コメントの削除に失敗しました: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    throw new Error("コメント削除結果が取得できませんでした");
  }

  return result as CommentDeleteResult;
}

/**
 * 閲覧数をインクリメント（重複カウント）
 */
export async function incrementViewCount(imageId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("increment_view_count", {
    image_id_param: imageId,
  });

  if (error) {
    console.error("Database query error:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    
    // エラーメッセージの安全な取得
    let errorMessage = "不明なエラー";
    if (error && typeof error === "object") {
      if ("message" in error && typeof error.message === "string") {
        errorMessage = error.message;
      } else if ("error" in error && typeof error.error === "string") {
        errorMessage = error.error;
      } else if ("code" in error) {
        errorMessage = `エラーコード: ${error.code}`;
      }
    }
    
    // HTMLレスポンスが含まれている場合（Cloudflareエラーなど）を検出
    if (errorMessage.includes("<!DOCTYPE") || errorMessage.includes("<html")) {
      console.error("HTMLレスポンスが返されました。Supabaseへの接続に問題がある可能性があります。");
      errorMessage = "データベースへの接続に失敗しました。しばらく待ってから再度お試しください。";
    }
    
    throw new Error(`閲覧数の更新に失敗しました: ${errorMessage}`);
  }
}
