import { NextRequest } from "next/server";
import { hashtagCampaignCelebrationRouteHandlers } from "@/app/api/hashtag-campaigns/[key]/celebration/handler";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return hashtagCampaignCelebrationRouteHandlers.postHashtagCampaignCelebrationRoute(request, key);
}
