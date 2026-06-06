import type { NextRequest } from "next/server";
import { postWardrobeClaimRoute } from "./handler";

export async function POST(request: NextRequest) {
  return postWardrobeClaimRoute(request);
}
