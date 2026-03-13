import { readFile } from "node:fs/promises";
import path from "node:path";
import { isLocalRequest } from "@/lib/local-request";

export async function GET(request: Request) {
  if (!isLocalRequest(request.headers)) {
    return new Response("Not Found", { status: 404 });
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
