import { NextRequest } from "next/server";
import { gachaSplitRouteHandlers } from "@/app/api/gacha-prompt/split/handler";

export async function POST(request: NextRequest) {
  return gachaSplitRouteHandlers.postGachaSplitRoute(request);
}
