import { readFile } from "node:fs/promises";
import path from "node:path";
import { createApiDocsBasicAuthChallengeResponse, getApiDocsAuthConfig, hasValidApiDocsBasicAuth } from "@/lib/api-docs-auth";

export async function GET(request: Request) {
  const config = getApiDocsAuthConfig();
  if (!config) {
    return new Response("Not Found", { status: 404 });
  }

  if (!hasValidApiDocsBasicAuth(request.headers, config)) {
    return createApiDocsBasicAuthChallengeResponse();
  }

  const specPath = path.join(process.cwd(), "docs", "openapi.yaml");
  const spec = await readFile(specPath, "utf8");

  return new Response(spec, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
