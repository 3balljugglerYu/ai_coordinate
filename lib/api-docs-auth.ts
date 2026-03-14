import { NextResponse, type NextRequest } from "next/server";

const API_DOCS_BASIC_AUTH_REALM = "Persta API Docs";
const IS_LOCAL_DEV_ENV = process.env.NODE_ENV === "development";

export interface ApiDocsAuthConfig {
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

export function isApiDocsPath(pathname: string): boolean {
  return (
    pathname === "/api-docs" ||
    pathname.startsWith("/api-docs/") ||
    pathname === "/openapi.yaml"
  );
}

export function getApiDocsAuthConfig(): ApiDocsAuthConfig | null {
  if (!IS_LOCAL_DEV_ENV) {
    return null;
  }

  const basicUser = normalize(process.env.API_DOCS_BASIC_AUTH_USER);
  const basicPassword = normalize(process.env.API_DOCS_BASIC_AUTH_PASSWORD);

  if (basicUser.length === 0 || basicPassword.length === 0) {
    return null;
  }

  return {
    basicUser,
    basicPassword,
  };
}

export function hasValidApiDocsBasicAuth(
  headers: Pick<Headers, "get">,
  config: ApiDocsAuthConfig
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

export function isAuthorizedApiDocsRequest(
  headers: Pick<Headers, "get">
): boolean {
  const config = getApiDocsAuthConfig();
  return config !== null && hasValidApiDocsBasicAuth(headers, config);
}

export function createApiDocsBasicAuthChallengeResponse(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${API_DOCS_BASIC_AUTH_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

export function enforceApiDocsBasicAuth(
  request: NextRequest
): NextResponse | null {
  if (!isApiDocsPath(request.nextUrl.pathname)) {
    return null;
  }

  const config = getApiDocsAuthConfig();
  if (!config) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (!hasValidApiDocsBasicAuth(request.headers, config)) {
    return createApiDocsBasicAuthChallengeResponse();
  }

  return null;
}
