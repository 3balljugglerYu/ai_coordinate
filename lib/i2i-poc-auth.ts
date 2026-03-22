import { NextResponse, type NextRequest } from "next/server";
import {
  createBasicAuthChallengeResponse,
  hasValidBasicAuth,
  normalizeBasicAuthValue,
} from "@/lib/basic-auth";

const BASIC_AUTH_REALM = "Persta I2I PoC";
const MIN_SLUG_LENGTH = 32;

export interface I2iPocConfig {
  slug: string;
  basicUser: string;
  basicPassword: string;
}

export function getI2iPocConfig(): I2iPocConfig | null {
  const slug = normalizeBasicAuthValue(process.env.I2I_POC_SLUG);
  const basicUser = normalizeBasicAuthValue(
    process.env.SHARED_BASIC_AUTH_USER
  );
  const basicPassword = normalizeBasicAuthValue(
    process.env.SHARED_BASIC_AUTH_PASSWORD
  );

  if (
    slug.length < MIN_SLUG_LENGTH ||
    basicUser.length === 0 ||
    basicPassword.length === 0
  ) {
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

export function hasValidI2iBasicAuth(
  headers: Headers,
  config: I2iPocConfig
): boolean {
  return hasValidBasicAuth(headers, config);
}

export function createI2iBasicAuthChallengeResponse(): NextResponse {
  return createBasicAuthChallengeResponse(BASIC_AUTH_REALM);
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
