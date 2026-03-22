import { NextResponse } from "next/server";

export interface BasicAuthConfig {
  basicUser: string;
  basicPassword: string;
}

export function normalizeBasicAuthValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function decodeBase64(encoded: string): string | null {
  try {
    if (typeof atob === "function") {
      return atob(encoded);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(encoded, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export function hasValidBasicAuth(
  headers: Pick<Headers, "get">,
  config: BasicAuthConfig
): boolean {
  const authHeader = headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const [scheme, encoded] = authHeader.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return false;
  }

  const decoded = decodeBase64(encoded);
  if (!decoded) {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return false;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return username === config.basicUser && password === config.basicPassword;
}

export function createBasicAuthChallengeResponse(
  realm: string
): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}
