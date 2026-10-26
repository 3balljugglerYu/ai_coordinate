import { NextRequest } from "next/server";
import { campaignGiftRouteHandlers } from "@/app/api/campaign-gifts/[key]/handler";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return campaignGiftRouteHandlers.getCampaignGiftRoute(key);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return campaignGiftRouteHandlers.postCampaignGiftRoute(request, key);
}
