import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

function getPopupBannerHashSalt(): string {
  return env.STYLE_RATE_LIMIT_HASH_SALT || env.ACCOUNT_FORFEITURE_HASH_SALT || "";
}

function normalizeClientIp(ip: string): string {
  return ip.trim().toLowerCase();
}

export function extractPopupBannerClientIp(request: NextRequest): string | null {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find((value) => value.length > 0);

    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return null;
}

export function buildPopupBannerClientIpHash(ip: string): string {
  return createHash("sha256")
    .update(`${normalizeClientIp(ip)}|${getPopupBannerHashSalt()}`, "utf8")
    .digest("hex");
}

export function getPopupBannerClientIpHash(request: NextRequest): string | null {
  const clientIp = extractPopupBannerClientIp(request);
  if (!clientIp) {
    return null;
  }

  return buildPopupBannerClientIpHash(clientIp);
}
