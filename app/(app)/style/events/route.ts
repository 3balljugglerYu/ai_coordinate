import { NextRequest } from "next/server";
import { styleEventsRouteHandlers } from "@/app/(app)/style/events/handler";

export async function POST(request: NextRequest) {
  return styleEventsRouteHandlers.postStyleEventsRoute(request);
}
