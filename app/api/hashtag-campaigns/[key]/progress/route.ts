import { NextRequest } from "next/server";
import { hashtagCampaignProgressRouteHandlers } from "@/app/api/hashtag-campaigns/[key]/progress/handler";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return hashtagCampaignProgressRouteHandlers.getHashtagCampaignProgressRoute(key);
}
