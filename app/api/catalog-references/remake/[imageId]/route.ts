import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogRemake } from "@/features/catalog-references/lib/remake-repository";
export async function GET(_request:NextRequest, context:{params:Promise<{imageId:string}>}){
  const user=await getUser();
  if(!user)return NextResponse.json({errorCode:"AUTH_REQUIRED"},{status:401});
  if(!await isInI2iCatalogAllowlist(user.id))return NextResponse.json({errorCode:"NOT_ALLOWED"},{status:403});
  const {imageId}=await context.params;
  if(!z.string().uuid().safeParse(imageId).success)return NextResponse.json({errorCode:"INVALID_REQUEST"},{status:400});
  try {
    const data=await getCatalogRemake(await createClient(),createAdminClient(),user.id,imageId);
    if(!data)return NextResponse.json({errorCode:"NOT_FOUND"},{status:404});
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({errorCode:"REMAKE_FAILED"},{status:500});}
}
