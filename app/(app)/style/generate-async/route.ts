import { NextRequest } from "next/server";
import { styleGenerateAsyncRouteHandlers } from "@/app/(app)/style/generate-async/handler";

export async function POST(request: NextRequest) {
  return styleGenerateAsyncRouteHandlers.postStyleGenerateAsyncRoute(request);
}
