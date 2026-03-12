import { NextResponse, type NextRequest } from "next/server";

const BASIC_AUTH_REALM = "Persta I2I PoC";
const MIN_SLUG_LENGTH = 32;

export interface I2iPocConfig {
  slug: string;
  basicUser: string;
  basicPassword: string;
}

function normalize(value: string | undefined): string {
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

export function getI2iPocConfig(): I2iPocConfig | null {
  const slug = normalize(process.env.I2I_POC_SLUG);
  const basicUser = normalize(process.env.I2I_BASIC_AUTH_USER);
  const basicPassword = normalize(process.env.I2I_BASIC_AUTH_PASSWORD);

  if (slug.length < MIN_SLUG_LENGTH || !basicUser || !basicPassword) {
    return null;
  }

  return {
    slug,
    basicUser,
    basicPassword,
  };
}

export function isI2iPocPath(pathname: string): boolean {
  return pathname === "/i2i" || pathname.startsWith("/i2i/");
}

export function isExpectedI2iSlug(slug: string): boolean {
  const config = getI2iPocConfig();
  if (!config) {
    return false;
  }
  return slug === config.slug;
}

export function hasValidI2iBasicAuth(
  headers: Headers,
  config: I2iPocConfig
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

export function createI2iBasicAuthChallengeResponse(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

export function enforceI2iPocBasicAuth(
  request: NextRequest
): NextResponse | null {
  if (!isI2iPocPath(request.nextUrl.pathname)) {
    return null;
  }

  const config = getI2iPocConfig();
  if (!config) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (!hasValidI2iBasicAuth(request.headers, config)) {
    return createI2iBasicAuthChallengeResponse();
  }

  return null;
}
