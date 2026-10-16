import { NextRequest } from "next/server";
import { hashtagCampaignTargetsRouteHandlers } from "@/app/api/hashtag-campaigns/[key]/targets/handler";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return hashtagCampaignTargetsRouteHandlers.getHashtagCampaignTargetsRoute(key);
}
