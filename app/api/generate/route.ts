import { NextRequest } from "next/server";
import { generateRouteHandlers } from "@/app/api/generate/handler";

export async function POST(request: NextRequest) {
  return generateRouteHandlers.postGenerateRoute(request);
}
