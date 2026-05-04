import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { persistBeforeImageForGeneratedImage } from "@/features/posts/lib/before-image-storage";
import { env } from "@/lib/env";

function isAuthorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  const tokenBuffer = Buffer.from(token, "utf8");
  const secretBuffer = Buffer.from(secret, "utf8");

  return (
    tokenBuffer.length === secretBuffer.length &&
    timingSafeEqual(tokenBuffer, secretBuffer)
  );
}

/**
 * 生成完了時に image-gen-worker から fire-and-forget で叩かれる内部 API。
 *
 * 認可は既存 ensure-webp と同じ CRON_SECRET ベアラ。
 * 重い処理（fetch + Sharp + Storage upload）は after() で実行し、
 * 即座に 202 Accepted を返してワーカ側のレイテンシを増やさない。
 */
export async function POST(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const generatedImageId =
    typeof body?.generatedImageId === "string" ? body.generatedImageId : "";
  if (!generatedImageId) {
    return NextResponse.json(
      { error: "generatedImageId is required" },
      { status: 400 }
    );
  }

  after(async () => {
    try {
      const result = await persistBeforeImageForGeneratedImage(generatedImageId);
      if (result.status === "persisted") {
        // 楽観表示が永続パスに切り替わるよう詳細キャッシュを失効させる
        revalidateTag(`post-detail-${generatedImageId}`, { expire: 0 });
      } else if (result.status === "failed") {
        console.warn("Internal persist-before-image failed:", {
          generatedImageId,
          reason: result.reason,
        });
      }
    } catch (error) {
      console.error("Internal persist-before-image route error:", {
        generatedImageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
