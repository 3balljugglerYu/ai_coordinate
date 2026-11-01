/** @jest-environment node */
jest.mock("next-intl/server",()=>({getTranslations:async()=> (key:string)=>key}));
jest.mock("@/lib/supabase/server",()=>({createClient:jest.fn()}));
jest.mock("@/lib/auth/i2i-catalog",()=>({isInI2iCatalogAllowlist:jest.fn()}));
import {createClient} from "@/lib/supabase/server";
import {isInI2iCatalogAllowlist} from "@/lib/auth/i2i-catalog";
import {OwnCatalogReviewEntry} from "@/features/catalog-references/components/OwnCatalogReviewEntry";
test.each([[true,[],null,true],[false,[{image_id:"image"}],null,true],[false,[],null,false],[false,null,{message:"failed"},false]] as const)("資格=%s 履歴=%j エラー=%j の入口",async(allowed,data,error,visible)=>{
 const eq=jest.fn().mockReturnValue({limit:async()=>({data,error})});
 (createClient as jest.Mock).mockResolvedValue({from:()=>({select:()=>({eq})})});(isInI2iCatalogAllowlist as jest.Mock).mockResolvedValue(allowed);
 const result=await OwnCatalogReviewEntry({userId:"owner"});expect(!!result).toBe(visible);expect(eq).toHaveBeenCalledWith("user_id","owner");if(result)expect(result.props.href).toBe("/my-page/catalog-reviews");
});
