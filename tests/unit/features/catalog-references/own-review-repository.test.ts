/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogRemake } from "@/features/catalog-references/lib/remake-repository";
import { getOwnCatalogReview, listOwnCatalogReviews } from "@/features/catalog-references/lib/own-review-repository";
jest.mock("@/features/posts/lib/utils",()=>({getPostThumbUrl:jest.fn((image:{image_url:string;storage_path_thumb?:string})=>image.storage_path_thumb ? `https://cdn/${image.storage_path_thumb}` : image.image_url)}));
type Result={data:unknown;error:unknown};
function client(results:Result[]){
 const calls:Array<[string,unknown[]]>=[];
 const from=jest.fn((table:string)=>{calls.push(["from",[table]]);const chain:Record<string,unknown>={};
 for(const method of ["select","eq","order"]){chain[method]=(...args:unknown[])=>{calls.push([method,args]);return chain;};}
 for(const method of ["maybeSingle","range"]){chain[method]=(...args:unknown[])=>{calls.push([method,args]);return Promise.resolve(results.shift()??{data:null,error:null});};}
 return chain;});
 return {db:{from} as unknown as SupabaseClient,from,calls};
}
const ok=(data:unknown)=>({data,error:null});
const row=(id:string,status="rejected",moderation_status="visible")=>({image_id:id,status,reason_category:"other",reason:"reason",updated_at:"now",image:{image_url:"https://cdn/result.webp",storage_path_thumb:null,is_posted:false,moderation_status}});
test.each([null,{status:"pending"},{status:"approved"}])("差戻しでない作品は秘密の表を読まない: %j",async review=>{
 const owner=client([ok(review)]),admin=client([]);
 expect(await getCatalogRemake(owner.db,admin.db,"owner","image")).toBeNull();expect(admin.from).not.toHaveBeenCalled();
 expect(owner.calls).toContainEqual(["eq",["user_id","owner"]]);
});
test("他人が作った元作品の秘密は読まない",async()=>{
 const owner=client([ok({status:"rejected"}),ok({id:"image",source_post_id:"other-root",generation_type:"free",moderation_status:"visible"}),ok(null)]),admin=client([]);
 expect(await getCatalogRemake(owner.db,admin.db,"owner","image")).toBeNull();expect(admin.from).not.toHaveBeenCalled();
 expect(owner.calls.filter(([name,args])=>name==="eq"&&args[0]==="user_id")).toHaveLength(3);
});
test("本人の差戻しは空の文章と選択を引き継ぎ、見本のidやURLを返さない",async()=>{
 const owner=client([ok({status:"rejected"}),ok({id:"image",source_post_id:null,generation_type:"free",moderation_status:"visible"})]);
 const admin=client([ok({takes:["pose","invalid","outfit"],reference_id:"secret",storage_path:"private"}),ok({prompt:""})]);
 expect(await getCatalogRemake(owner.db,admin.db,"owner","image")).toEqual({prompt:"",takes:["outfit","pose"]});
 expect(admin.calls.filter(([name])=>name==="select")).toEqual([["select",["takes"]],["select",["prompt"]]]);
});
test("元作品が本人なら元の文章と選択だけを読む",async()=>{
 const owner=client([ok({status:"rejected"}),ok({id:"image",source_post_id:"root",generation_type:"free",moderation_status:"visible"}),ok({id:"root"})]);
 const admin=client([ok({takes:["pose"]}),ok({prompt:"hello"})]);
 expect(await getCatalogRemake(owner.db,admin.db,"owner","image")).toEqual({prompt:"hello",takes:["pose"]});
 expect(admin.calls.filter(([name])=>name==="eq")).toEqual([["eq",["image_id","root"]],["eq",["image_id","root"]]]);
});
test.each(["hidden","removed"])("利用できない作品は引継ぎ不可: %s",async moderation_status=>{
 const owner=client([ok({status:"rejected"}),ok({generation_type:"free",moderation_status})]),admin=client([]);
 expect(await getCatalogRemake(owner.db,admin.db,"owner","image")).toBeNull();expect(admin.from).not.toHaveBeenCalled();
});
test("読み込み失敗を空の成功にしない",async()=>{
 const owner=client([{data:null,error:{message:"unavailable"}}]);
 await expect(getOwnCatalogReview(owner.db,"owner","image")).rejects.toThrow();
});
test("本人の状態だけを返し、非表示作品は画像を返さず操作不可にする",async()=>{
 const owner=client([ok(row("image","pending","hidden"))]);
 expect(await getOwnCatalogReview(owner.db,"owner","image")).toMatchObject({imageId:"image",status:"pending",available:false,imageUrl:null});
 expect(owner.calls).toContainEqual(["eq",["user_id","owner"]]);expect(owner.calls).toContainEqual(["eq",["image_id","image"]]);
 expect(owner.from).toHaveBeenCalledTimes(1);
});
test("操作が必要な区分の順に並べ、21件目は次ページに残す",async()=>{
 const owner=client([ok(Array.from({length:21},(_,i)=>row(String(i))))]);
 const result=await listOwnCatalogReviews(owner.db,"owner");
 expect(result.items).toHaveLength(20);expect(result.nextCursor).toBe("0:20");
 expect(owner.calls).toContainEqual(["range",[0,20]]);
});
test("差戻し、未投稿の承認、未申請、確認中、投稿済みの順に全区分を読む",async()=>{
 const owner=client([ok([]),ok([]),ok([]),ok([]),ok([])]);
 expect(await listOwnCatalogReviews(owner.db,"owner")).toEqual({items:[],nextCursor:null});
 expect(owner.calls.filter(([name,args])=>name==="eq"&&args[0]==="status").map(([,args])=>args[1])).toEqual(["rejected","approved","not_submitted","pending","approved"]);
 expect(owner.calls.filter(([name,args])=>name==="eq"&&args[0]==="image.is_posted").map(([,args])=>args[1])).toEqual([false,true]);
 expect(owner.calls.filter(([name,args])=>name==="eq"&&args[0]==="user_id")).toHaveLength(5);
});

test("次の区分へ進む境界と次ページのオフセットを保つ",async()=>{
 const owner=client([ok(Array.from({length:20},(_,i)=>row(String(i))))]);
 expect((await listOwnCatalogReviews(owner.db,"owner","2:4")).nextCursor).toBe("3:0");expect(owner.calls).toContainEqual(["range",[4,24]]);
 const last=client([ok(Array.from({length:20},(_,i)=>row(String(i),"approved")))]);expect((await listOwnCatalogReviews(last.db,"owner","4:0")).nextCursor).toBeNull();
});
test("結合が配列でも本人の画像を返し、不明な状態は返さない",async()=>{
 const entry=row("image");const owner=client([ok({...entry,image:[entry.image]}),ok({...entry,status:"invalid"}),ok(null)]);
 expect(await getOwnCatalogReview(owner.db,"owner","image")).toMatchObject({imageUrl:"https://cdn/result.webp",available:true});expect(await getOwnCatalogReview(owner.db,"owner","image")).toBeNull();expect(await getOwnCatalogReview(owner.db,"owner","image")).toBeNull();
});
test("一覧のDBエラーは失敗にする",async()=>{const owner=client([{data:null,error:{message:"failed"}}]);await expect(listOwnCatalogReviews(owner.db,"owner")).rejects.toThrow();});
test.each([0,1,2,3])("作り直しの取得エラー段階%sを隠さない",async stage=>{
 const results:Result[]=[ok({status:"rejected"}),ok({source_post_id:"root",generation_type:"free",moderation_status:"visible"}),ok({id:"root"})];
 if(stage<3)results[stage]={data:null,error:{message:"failed"}};
 const owner=client(results);const admin=client(stage===3?[{data:null,error:{message:"failed"}},ok({prompt:""})]:[]);
 await expect(getCatalogRemake(owner.db,admin.db,"owner","image")).rejects.toThrow();
});
test.each([[null,{prompt:""}],[{takes:[]},{prompt:""}],[{takes:["pose"]},null],[{takes:["pose"]},{prompt:null}]])("不完全な秘密データは補完せず作り直し不可",async(reference,prompt)=>{
 const owner=client([ok({status:"rejected"}),ok({generation_type:"free",moderation_status:"visible"})]),admin=client([ok(reference),ok(prompt)]);expect(await getCatalogRemake(owner.db,admin.db,"owner","image")).toBeNull();
});

test("審査一覧は詳細画像ではなくサムネイルを返す",async()=>{
 const entry=row("image");
 const owner=client([ok({...entry,image:{...entry.image,storage_path_thumb:"thumb.webp"}})]);
 expect(await getOwnCatalogReview(owner.db,"owner","image")).toMatchObject({imageUrl:"https://cdn/thumb.webp"});
 const columns=owner.calls.find(([name])=>name==="select")?.[1][0] as string;
 expect(columns).toContain("storage_path_thumb");
 expect(columns).not.toContain("storage_path_display");
});
