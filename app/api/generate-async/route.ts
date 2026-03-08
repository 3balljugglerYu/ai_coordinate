import { NextRequest } from "next/server";
import { generateAsyncRouteHandlers } from "@/app/api/generate-async/handler";

export async function POST(request: NextRequest) {
  return generateAsyncRouteHandlers.postGenerateAsyncRoute(request);
}
