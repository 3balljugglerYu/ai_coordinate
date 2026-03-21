import { NextRequest } from "next/server";
import { styleGenerateRouteHandlers } from "@/app/(app)/style/generate/handler";

export async function POST(request: NextRequest) {
  return styleGenerateRouteHandlers.postStyleGenerateRoute(request);
}
