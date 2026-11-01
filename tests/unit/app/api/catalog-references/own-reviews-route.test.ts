/** @jest-environment node */
jest.mock("@/lib/auth",()=>({getUser:jest.fn()}));
jest.mock("@/lib/supabase/server",()=>({createClient:jest.fn()}));
jest.mock("@/lib/supabase/admin",()=>({createAdminClient:jest.fn()}));
jest.mock("@/lib/auth/i2i-catalog",()=>({isInI2iCatalogAllowlist:jest.fn()}));
jest.mock("@/features/catalog-references/lib/own-review-repository",()=>({getOwnCatalogReview:jest.fn(),listOwnCatalogReviews:jest.fn()}));
jest.mock("@/features/catalog-references/lib/remake-repository",()=>({getCatalogRemake:jest.fn()}));
import {NextRequest} from "next/server";
import {getUser} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {isInI2iCatalogAllowlist} from "@/lib/auth/i2i-catalog";
import {getCatalogRemake} from "@/features/catalog-references/lib/remake-repository";
import {getOwnCatalogReview,listOwnCatalogReviews} from "@/features/catalog-references/lib/own-review-repository";
import {GET as read} from "@/app/api/catalog-references/reviews/route";
import {GET as remake} from "@/app/api/catalog-references/remake/[imageId]/route";
const id="11111111-1111-4111-8111-111111111111";
const request=(query="")=>new NextRequest(`http://localhost/api/catalog-references/reviews${query}`);
const context={params:Promise.resolve({imageId:id})};
beforeEach(()=>{
 jest.clearAllMocks();(getUser as jest.Mock).mockResolvedValue({id:"owner"});(createClient as jest.Mock).mockResolvedValue("session");
 (isInI2iCatalogAllowlist as jest.Mock).mockResolvedValue(true);(getOwnCatalogReview as jest.Mock).mockResolvedValue(null);(listOwnCatalogReviews as jest.Mock).mockResolvedValue({items:[],nextCursor:null});(getCatalogRemake as jest.Mock).mockResolvedValue(null);
});
test("ログイン必須、未認証では取得しない",async()=>{
 (getUser as jest.Mock).mockResolvedValue(null);expect((await read(request())).status).toBe(401);expect((await remake(request(),context)).status).toBe(401);expect(createClient).not.toHaveBeenCalled();
});
test.each(["?imageId=invalid","?cursor=5:0","?cursor=0:-1"])("不正な値では読み込まない: %s",async query=>{
 expect((await read(request(query))).status).toBe(400);expect(createClient).not.toHaveBeenCalled();
});
test("本人のセッションと画像IDで取得し、キャッシュしない",async()=>{
 const response=await read(request(`?imageId=${id}`));expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(getOwnCatalogReview).toHaveBeenCalledWith("session","owner",id);await expect(response.json()).resolves.toEqual({review:null});
});
test("使える人から外れても審査結果は読めるが、作り直しの取得は403",async()=>{
 (isInI2iCatalogAllowlist as jest.Mock).mockResolvedValue(false);expect((await read(request())).status).toBe(200);expect((await remake(request(),context)).status).toBe(403);expect(getCatalogRemake).not.toHaveBeenCalled();
});
test("存在しない・他人の作り直しは404",async()=>{expect((await remake(request(),context)).status).toBe(404);});
test("作り直しも非キャッシュで返す",async()=>{
 (getCatalogRemake as jest.Mock).mockResolvedValue({prompt:"",takes:["pose"]});const response=await remake(request(),context);expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");await expect(response.json()).resolves.toEqual({prompt:"",takes:["pose"]});
});
test("読み込みエラーは500、内部の詳細は返さない",async()=>{
 (listOwnCatalogReviews as jest.Mock).mockRejectedValue(new Error("secret"));const response=await read(request());expect(response.status).toBe(500);expect(await response.text()).not.toContain("secret");
});

test("作り直しの不正IDは400、内部エラーは詳細を隠して500",async()=>{
 expect((await remake(request(),{params:Promise.resolve({imageId:"invalid"})})).status).toBe(400);
 (getCatalogRemake as jest.Mock).mockRejectedValue(new Error("secret"));const response=await remake(request(),context);expect(response.status).toBe(500);expect(await response.text()).not.toContain("secret");
});
