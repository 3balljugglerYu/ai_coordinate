import { after, NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";
import {
  getSubscriptionBonusMultiplier,
  normalizeSubscriptionPlan,
} from "@/features/subscription/subscription-config";

/**
 * デイリー投稿特典を付与するヘルパー関数
 * べき等性を保証し、同じ投稿IDで複数回呼び出しても1回のみ特典が付与されます
 * @param userId ユーザーID
 * @param generationId 投稿された画像のID
 * @returns 付与されたペルコイン数（0: 未付与、50: 付与成功）
 */
async function grantDailyPostBonus(
  userId: string,
  generationId: string
): Promise<number> {
  try {
    // service_role 専用の RPC。session client からは呼べない
    // (以前は anon/authenticated にも EXECUTE があり、投稿せずに直接呼べた)
    const supabase = createAdminClient();
    const { data, error: rpcError } = await supabase.rpc(
      "grant_daily_post_bonus",
      {
        p_user_id: userId,
        p_generation_id: generationId,
      }
    );

    if (!rpcError && typeof data === "number") {
      return data;
    } else if (rpcError) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("[Daily Post Bonus] RPC error:", rpcError);
      // エラー時は0を返す（投稿は成功させる）
      return 0;
    }

    return 0;
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Daily Post Bonus] Exception:", error);
    // エラー時は0を返す（投稿は成功させる）
    return 0;
  }
}

/**
 * この投稿の生成で「誰かのプロンプトを使った日次ボーナス」が付与されていたか。
 *
 * 付与自体は**生成成功時**（record_prompt_usage 経由）に済んでいる。投稿とは
 * タイミングが違うが、伝える場は投稿直後の付与モーダルに寄せる
 * （生成直後は結果画像に集中しており、新しいUIを増やしたくない）。
 * 付与の判定はやり直さず、確定済みの取引を引くだけにする。
 */
async function getPromptUseBonusForGeneration(
  userId: string,
  generationId: string
): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { data: generation, error: generationError } = await supabase
      .from("generated_images")
      .select("image_job_id")
      .eq("id", generationId)
      .maybeSingle();

    if (generationError || !generation?.image_job_id) {
      return 0;
    }

    const { data, error } = await supabase
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("transaction_type", "prompt_use_bonus")
      .eq("metadata->>image_job_id", generation.image_job_id as string)
      .maybeSingle();

    if (error || !data) {
      return 0;
    }

    return typeof data.amount === "number" ? data.amount : 0;
  } catch (error) {
    console.error("[Prompt Use Bonus] lookup failed:", error);
    return 0;
  }
}

async function getDailyPostBonusMeta(userId: string): Promise<{
  bonusMultiplier: number;
  subscriptionPlan: "free" | "light" | "standard" | "premium";
} | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_plan")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("[Daily Post Bonus] Failed to fetch subscription plan:", error);
      return null;
    }

    const subscriptionPlan = normalizeSubscriptionPlan(data?.subscription_plan);
    return {
      bonusMultiplier: getSubscriptionBonusMultiplier(subscriptionPlan),
      subscriptionPlan,
    };
  } catch (error) {
    console.error("[Daily Post Bonus] Failed to prepare bonus meta:", error);
    return null;
  }
}

/**
 * 投稿API
 */
export async function POST(request: NextRequest) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, caption } = body;
    const showBeforeImage =
      typeof body?.show_before_image === "boolean"
        ? body.show_before_image
        : undefined;
    // 未指定なら列を更新しない（既定は DB の 'public'）。
    // enum 外の値は無視して既定へ倒す（fail closed ではなく既存挙動維持）。
    const promptVisibility =
      body?.prompt_visibility === "private" ||
      body?.prompt_visibility === "public"
        ? body.prompt_visibility
        : undefined;

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    // 投稿処理
    const result = await postImageServer(
      id,
      caption,
      showBeforeImage,
      promptVisibility
    );

    // デイリー投稿特典の付与（エラーが発生しても投稿は成功させる）
    // 注意: デイリーボーナスは新しい投稿（POST /api/posts/post）でのみ付与されます
    // キャプション更新（PUT /api/posts/update）ではボーナスを付与しません
    const bonus_granted = await grantDailyPostBonus(user.id, result.id!);
    const bonusMeta =
      bonus_granted > 0 ? await getDailyPostBonusMeta(user.id) : null;
    // 誰かのプロンプトを使って生成した作品なら、その日次ボーナスも伝える
    const prompt_use_bonus_granted = await getPromptUseBonusForGeneration(
      user.id,
      result.id!
    );

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    // 投稿直後の詳細画面は stale を返さないように即時失効する
    revalidateTag(`post-detail-${id}`, { expire: 0 });
    revalidateTag(`user-profile-${user.id}`, "max");
    revalidateTag(`my-page-${user.id}`, "max");
    revalidateTag(`my-page-credits-${user.id}`, "max");
    revalidateTag(`coordinate-${user.id}`, "max");
    revalidateTag(`challenge-${user.id}`, "max");
    revalidateTag(`my-page-image-${user.id}-${id}`, { expire: 0 });
    revalidatePath("/");
    revalidatePath(`/posts/${id}`);

    if (result.id) {
      after(async () => {
        try {
          await ensureWebPVariants(result.id!);
        } catch (error) {
          console.error("Post route WebP safety net error:", error);
        }
      });
    }

    return NextResponse.json({
      id: result.id!,
      is_posted: result.is_posted,
      caption: result.caption ?? null,
      posted_at: result.posted_at || new Date().toISOString(),
      bonus_granted, // 付与されたペルコイン数（0: 未付与）
      // 誰かのプロンプトを使ったことによる日次ボーナス（0: 未付与）。
      // 生成時に確定しているため、ここでは引くだけ
      prompt_use_bonus_granted,
      bonus_multiplier: bonusMeta?.bonusMultiplier,
      subscription_plan: bonusMeta?.subscriptionPlan,
      // 付与モーダルの出し分けに使う。フリースタイルのときだけ
      // クリエイター還元の案内を併記する
      generation_type: result.generation_type ?? null,
    });
  } catch (error) {
    // free 以外の root で非公開を指定した場合は理由の分かる 400 を返す。
    // trigger が拒否するため DB 側の不変条件は保たれているが、
    // 「投稿に失敗しました」だけでは利用者が直せない。
    // instanceof ではなくメッセージの構造的チェックにする。
    // server-database をモックするテストでは helper が undefined になり、
    // 呼び出し自体が例外になる（隣の post_suspended_cannot_publish と同じ理由）。
    if (
      error instanceof Error &&
      error.message.includes("prompt_visibility=private")
    ) {
      return NextResponse.json(
        {
          error: copy.promptVisibilityNotAllowed,
          errorCode: "POSTS_PROMPT_VISIBILITY_NOT_ALLOWED",
        },
        { status: 400 }
      );
    }

    // 公開停止中のコンテンツは DB trigger (enforce_no_publish_while_removed) が
    // 再公開を拒否する。クライアントに専用コードを返し、異議申立てへ案内させる。
    if (
      error instanceof Error &&
      error.message.includes("post_suspended_cannot_publish")
    ) {
      return NextResponse.json(
        {
          error: copy.postSuspendedCannotPublish,
          errorCode: "POSTS_SUSPENDED_CANNOT_PUBLISH",
        },
        { status: 409 }
      );
    }

    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("Post API error:", error);
    return NextResponse.json(
      {
        error: copy.postFailed,
        errorCode: "POSTS_POST_FAILED",
      },
      { status: 500 }
    );
  }
}
