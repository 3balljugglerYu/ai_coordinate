import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createApiDocsBasicAuthChallengeResponse, getApiDocsAuthConfig, hasValidApiDocsBasicAuth } from "@/lib/api-docs-auth";

const REDOC_BUNDLE_PATH = path.join(
  process.cwd(),
  "node_modules",
  "redoc",
  "bundles",
  "redoc.standalone.js"
);
const REDOC_LOGO_URL = "https://cdn.redoc.ly/redoc/logo-mini.svg";
const LOCAL_LOGO_URL = "/icon.png";

export async function GET(request: Request) {
  const config = getApiDocsAuthConfig();
  if (!config) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  if (!hasValidApiDocsBasicAuth(request.headers, config)) {
    return createApiDocsBasicAuthChallengeResponse();
  }

  const bundle = (await readFile(REDOC_BUNDLE_PATH, "utf8")).replaceAll(
    REDOC_LOGO_URL,
    LOCAL_LOGO_URL
  );

  return new NextResponse(bundle, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
