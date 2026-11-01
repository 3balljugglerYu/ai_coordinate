/** @jest-environment node */
import { MyPageImageGallery } from "@/features/my-page/components/MyPageImageGallery";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { CachedMyPageImageGallery } from "@/features/my-page/components/CachedMyPageImageGallery";
jest.mock("@/lib/auth/i2i-catalog",()=>({isInI2iCatalogAllowlist:jest.fn()}));
jest.mock("@/features/my-page/components/CachedMyPageImageGallery",()=>({CachedMyPageImageGallery:jest.fn()}));
test.each([true,false])("本人のi2i招待結果%sをキャッシュ済み一覧へ渡す",async allowed=>{
 jest.mocked(isInI2iCatalogAllowlist).mockResolvedValue(allowed);
 const element=await MyPageImageGallery({userId:"viewer"});
 expect(isInI2iCatalogAllowlist).toHaveBeenLastCalledWith("viewer");
 expect(element.type).toBe(CachedMyPageImageGallery);
 expect(element.props).toEqual({userId:"viewer",catalogReferenceAvailable:allowed});
});
