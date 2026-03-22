import { NextResponse, type NextRequest } from "next/server";
import {
  createBasicAuthChallengeResponse,
  hasValidBasicAuth,
  normalizeBasicAuthValue,
  type BasicAuthConfig,
} from "@/lib/basic-auth";

const STYLE_BASIC_AUTH_REALM = "Persta One-Tap Style";

export function isStylePath(pathname: string): boolean {
  return pathname === "/style" || pathname.startsWith("/style/");
}

export function getStyleBasicAuthConfig(): BasicAuthConfig | null {
  const basicUser = normalizeBasicAuthValue(
    process.env.SHARED_BASIC_AUTH_USER
  );
  const basicPassword = normalizeBasicAuthValue(
    process.env.SHARED_BASIC_AUTH_PASSWORD
  );

  if (basicUser.length === 0 || basicPassword.length === 0) {
    return null;
  }

  return {
    basicUser,
    basicPassword,
  };
}

export function createStyleBasicAuthChallengeResponse(): NextResponse {
  return createBasicAuthChallengeResponse(STYLE_BASIC_AUTH_REALM);
}

export function enforceStyleBasicAuth(
  request: NextRequest
): NextResponse | null {
  if (!isStylePath(request.nextUrl.pathname)) {
    return null;
  }

  const config = getStyleBasicAuthConfig();
  if (!config) {
    return null;
  }

  if (!hasValidBasicAuth(request.headers, config)) {
    return createStyleBasicAuthChallengeResponse();
  }

  return null;
}
