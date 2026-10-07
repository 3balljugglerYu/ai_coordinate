import { NextRequest } from "next/server";
import { nameInputCreateRouteHandlers } from "@/app/api/name-input/create/handler";

export async function POST(request: NextRequest) {
  return nameInputCreateRouteHandlers.postNameInputCreateRoute(request);
}
