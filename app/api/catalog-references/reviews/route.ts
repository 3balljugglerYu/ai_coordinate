import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOwnCatalogReview, listOwnCatalogReviews } from "@/features/catalog-references/lib/own-review-repository";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({errorCode:"AUTH_REQUIRED"},{status:401});
  const imageId = request.nextUrl.searchParams.get("imageId");
  const cursor = request.nextUrl.searchParams.get("cursor") ?? "0:0";
  if ((imageId !== null && !z.string().uuid().safeParse(imageId).success) || !/^[0-4]:\d{1,7}$/.test(cursor)) {
    return NextResponse.json({errorCode:"INVALID_REQUEST"},{status:400});
  }
  try {
    const client = await createClient();
    const data = imageId ? {review:await getOwnCatalogReview(client,user.id,imageId)} : await listOwnCatalogReviews(client,user.id,cursor);
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({errorCode:"REVIEW_READ_FAILED"},{status:500});
  }
}
