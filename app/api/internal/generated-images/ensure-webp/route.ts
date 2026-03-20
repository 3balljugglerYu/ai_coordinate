import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";
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
  const imageId = typeof body?.imageId === "string" ? body.imageId : "";
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  after(async () => {
    try {
      await ensureWebPVariants(imageId);
    } catch (error) {
      console.error("Internal ensure-webp route error:", {
        imageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
