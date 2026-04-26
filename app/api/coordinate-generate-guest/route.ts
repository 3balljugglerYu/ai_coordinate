import { NextRequest } from "next/server";
import { coordinateGenerateGuestRouteHandlers } from "@/app/api/coordinate-generate-guest/handler";

export async function POST(request: NextRequest) {
  return coordinateGenerateGuestRouteHandlers.postCoordinateGenerateGuestRoute(
    request
  );
}
