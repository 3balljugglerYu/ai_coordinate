/** @jest-environment node */
jest.mock("next/cache",()=>({cacheLife:jest.fn(),cacheTag:jest.fn()}));
jest.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({})}));
jest.mock("@/features/my-page/lib/server-api",()=>({getMyImagesServer:async()=>[]}));
jest.mock("@/features/my-page/components/MyPageImageGalleryClient",()=>({MyPageImageGalleryClient:()=>null}));
import {cacheTag} from "next/cache";
import {CATALOG_REVIEW_IMAGES_TAG} from "@/features/catalog-references/lib/review-status";
import {CachedMyPageImageGallery} from "@/features/my-page/components/CachedMyPageImageGallery";
test("申請・判定で失効させるタグを画像一覧の読み取りにも付ける",async()=>{
 await CachedMyPageImageGallery({userId:"owner"});expect(cacheTag).toHaveBeenCalledWith("my-page-owner",CATALOG_REVIEW_IMAGES_TAG);
});
