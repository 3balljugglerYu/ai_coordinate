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
 * 他の人のプロンプトで作った作品を投稿したときの日次ボーナス。
 *
 * **投稿を条件にしている。** 生成で終わるとその人の中で完結するが、投稿されて
 * 初めてフィードで次の人の目に触れ、原作者にも露出が回って連鎖が起きる。
 * 判定は RPC 側(派生か / 自己利用でないか / その日つくったか / 1日1回)。
 */
async function grantPromptUseBonus(
  userId: string,
  generationId: string
): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("grant_prompt_use_daily_bonus", {
      p_user_id: userId,
      p_generation_id: generationId,
    });

    if (error) {
      console.error("[Prompt Use Bonus] RPC error:", error);
      return 0;
    }

    return typeof data === "number" ? data : 0;
  } catch (error) {
    // 付与に失敗しても投稿は成功させる(投稿ボーナスと同じ方針)
    console.error("[Prompt Use Bonus] Exception:", error);
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
    // 他の人のプロンプトで作った作品なら上乗せ（対象外なら 0）
    const prompt_use_bonus_granted = await grantPromptUseBonus(
      user.id,
      result.id!
    );
    const bonusMeta =
      bonus_granted > 0 ? await getDailyPostBonusMeta(user.id) : null;

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
      bonus_granted, // 投稿ボーナスで付与されたペルコイン数（0: 未付与）
      // 他の人のプロンプトで作った作品への上乗せ（0: 対象外）
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
