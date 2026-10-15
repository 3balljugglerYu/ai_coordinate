import { NextRequest } from "next/server";
import { hashtagCampaignEntryRouteHandlers } from "@/app/api/hashtag-campaigns/[key]/entry/handler";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return hashtagCampaignEntryRouteHandlers.postHashtagCampaignEntryRoute(request, key);
}
