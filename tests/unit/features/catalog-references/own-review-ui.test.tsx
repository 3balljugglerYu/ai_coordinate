/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OwnCatalogReviewPanel } from "@/features/catalog-references/components/OwnCatalogReviewPanel";
import { CatalogReviewCard } from "@/features/catalog-references/components/CatalogReviewCard";
import { OwnCatalogReviewList } from "@/features/catalog-references/components/OwnCatalogReviewList";
import type { OwnCatalogReview } from "@/features/catalog-references/lib/review-status";
jest.mock("next-intl",()=>({useTranslations:()=> (key:string)=>key,useLocale:()=>"ja"}));
jest.mock("next/image",()=>({__esModule:true,default:()=>null}));
const review:OwnCatalogReview={imageId:"target",status:"not_submitted",reasonCategory:null,reason:null,updatedAt:"now",imageUrl:null,isPosted:false,available:true};
let fetchMock:jest.Mock;
beforeEach(()=>{window.history.replaceState(null,"","/");fetchMock=jest.fn();global.fetch=fetchMock;});
test("明示的な申請後に確認中となり、投稿はできない",async()=>{
 fetchMock.mockResolvedValue({ok:true});render(<CatalogReviewCard review={review}/>);
 fireEvent.click(screen.getByRole("button",{name:"submit"}));
 await screen.findByText("waiting");expect(screen.queryByRole("button",{name:"submit"})).not.toBeInTheDocument();expect(screen.queryByRole("link",{name:"post"})).not.toBeInTheDocument();
 expect(fetchMock).toHaveBeenCalledWith("/api/catalog-references/review",expect.objectContaining({method:"POST",body:JSON.stringify({imageId:"target"})}));
});
test("申請エラーは表示して再試行できる",async()=>{
 fetchMock.mockResolvedValue({ok:false});render(<CatalogReviewCard review={review}/>);fireEvent.click(screen.getByRole("button",{name:"submit"}));await screen.findByRole("alert");expect(screen.getByRole("button",{name:"submit"})).toBeEnabled();
});
test("差戻しは理由とガイドライン、新しい見本の導線だけを出す",()=>{
 render(<CatalogReviewCard review={{...review,status:"rejected",reasonCategory:"real_person",reason:"<script>plain text</script>"}}/>);
 expect(screen.getByText("catalogReviewReasonRealPerson")).toBeInTheDocument();expect(screen.getByText("<script>plain text</script>")).toBeInTheDocument();
 expect(screen.getByRole("link",{name:"remake"})).toHaveAttribute("href","/free?remake=target");expect(screen.queryByRole("button",{name:"submit"})).not.toBeInTheDocument();
});
test("承認後も本人が投稿ボタンを押す必要がある",()=>{
 render(<CatalogReviewCard review={{...review,status:"approved"}}/>);expect(screen.getByRole("link",{name:"post"})).toHaveAttribute("href","/posts/new/target");expect(fetchMock).not.toHaveBeenCalled();
});
test("非表示作品に操作を出さない",()=>{
 render(<CatalogReviewCard review={{...review,status:"approved",available:false}}/>);expect(screen.getByText("unavailable")).toBeInTheDocument();expect(screen.queryByRole("link",{name:"post"})).not.toBeInTheDocument();
});
test("通知の対象が最初のページに無くても個別に読み、重複させない",async()=>{
 window.history.replaceState(null,"","/my-page/catalog-reviews?image=target");
 fetchMock.mockImplementation((url:string)=>Promise.resolve({ok:true,json:async()=>url.includes("imageId=")?{review:{...review,status:"approved"}}:{items:[{...review,imageId:"other"}],nextCursor:null}}));
 render(<OwnCatalogReviewList imageId="target"/>);
 await screen.findByRole("link",{name:"post"});expect(fetchMock).toHaveBeenCalledWith("/api/catalog-references/reviews?imageId=target",expect.any(Object));
 expect(screen.getAllByTestId("catalog-review-card")).toHaveLength(2);
});
test("一覧の失敗を空と扱わず、再試行する",async()=>{
 fetchMock.mockRejectedValueOnce(new Error()).mockResolvedValue({ok:true,json:async()=>({items:[],nextCursor:null})});render(<OwnCatalogReviewList/>);
 await screen.findByRole("alert");expect(screen.queryByText("empty")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"retry"}));await screen.findByText("empty");
});

test("状態が同じでも投稿済み・公開停止の更新を反映する",()=>{
 const {rerender}=render(<CatalogReviewCard review={{...review,status:"approved"}}/>);
 expect(screen.getByRole("link",{name:"post"})).toBeInTheDocument();
 rerender(<CatalogReviewCard review={{...review,status:"approved",isPosted:true}}/>);
 expect(screen.queryByRole("link",{name:"post"})).not.toBeInTheDocument();expect(screen.getByText("posted")).toBeInTheDocument();
 rerender(<CatalogReviewCard review={{...review,status:"approved",available:false}}/>);
 expect(screen.getByText("unavailable")).toBeInTheDocument();
});

test("続きの作品を取得し、境界の重複は1件にまとめる",async()=>{
 fetchMock.mockImplementation((url:string)=>Promise.resolve({ok:true,json:async()=>url.includes("cursor=")?{items:[review,{...review,imageId:"next"}],nextCursor:null}:{items:[review],nextCursor:"0:1"}}));
 render(<OwnCatalogReviewList/>);fireEvent.click(await screen.findByRole("button",{name:"more"}));await screen.findAllByTestId("catalog-review-card");
 await waitFor(()=>expect(screen.getAllByTestId("catalog-review-card")).toHaveLength(2));expect(screen.queryByRole("button",{name:"more"})).not.toBeInTheDocument();
});
test("通知対象が取得できない場合に空の一覧と誤表示しない",async()=>{
 fetchMock.mockImplementation((url:string)=>Promise.resolve({ok:true,json:async()=>url.includes("imageId=")?{review:null}:{items:[],nextCursor:null}}));render(<OwnCatalogReviewList imageId="missing"/>);
 await screen.findByRole("alert");expect(screen.queryByText("empty")).not.toBeInTheDocument();
});

test("個別状態の取得失敗は一覧への入口を残し、戻ったときに読み直す",async()=>{
 fetchMock.mockRejectedValueOnce(new Error()).mockResolvedValue({ok:true,json:async()=>({review:{...review,status:"pending"}})});
 const callback=jest.fn();render(<OwnCatalogReviewPanel imageId="target" onReviewLoaded={callback}/>);
 expect(await screen.findByRole("link",{name:"title"})).toHaveAttribute("href","/my-page/catalog-reviews?image=target");
 fireEvent.focus(window);await screen.findByText("waiting");expect(callback).toHaveBeenCalledWith("target",expect.objectContaining({status:"pending"}));
});
test("個別取得の異常応答を成功と扱わない",async()=>{
 fetchMock.mockResolvedValue({ok:false});render(<OwnCatalogReviewPanel imageId="target"/>);await screen.findByRole("link",{name:"title"});
});

test("非承認の扱いと引継ぎを案内し、見本ガイドを閲覧だけで開く",async()=>{
 render(<CatalogReviewCard review={{...review,status:"rejected",reasonCategory:"other",reason:"運営の説明"}}/>);
 expect(screen.getByText("rejectedTitle")).toBeInTheDocument();expect(screen.getByText("rejectedCannotPost")).toBeInTheDocument();expect(screen.getByText("remakeHint")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"referenceGuide"}));await screen.findByRole("dialog");expect(fetchMock).not.toHaveBeenCalled();
});

function deferredResponse() {
 let resolve!: (response: unknown) => void;
 let reject!: (reason: unknown) => void;
 const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
 return {promise, resolve, reject};
}
const responseFor = (status: OwnCatalogReview["status"]) => ({ok:true,json:async()=>({review:{...review,status}})});

test.each(["success", "error"])("個別パネルは古い取得の%sで最新の承認を戻さない", async outcome => {
 const first = deferredResponse();
 fetchMock.mockReturnValueOnce(first.promise).mockResolvedValue(responseFor("approved"));
 const callback = jest.fn();
 render(<OwnCatalogReviewPanel imageId="target" onReviewLoaded={callback}/>);
 await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));
 fireEvent.focus(window);
 await screen.findByRole("link", {name:"post"});
 await act(async()=>{if(outcome==="success")first.resolve(responseFor("pending"));else first.reject(new Error("old request"));});
 expect(screen.getByRole("link", {name:"post"})).toBeInTheDocument();
 expect(screen.queryByText("waiting")).not.toBeInTheDocument();
 expect(callback).toHaveBeenCalledTimes(1);
 expect(callback).toHaveBeenLastCalledWith("target", expect.objectContaining({status:"approved"}));
});

test.each(["success", "error"])("通知対象は古い取得の%sで最新の承認を戻さない", async outcome => {
 const first = deferredResponse();let targetCalls=0;
 fetchMock.mockImplementation((url:string)=>url.includes("imageId=")
   ? (++targetCalls===1 ? first.promise : Promise.resolve(responseFor("approved")))
   : Promise.resolve({ok:true,json:async()=>({items:[],nextCursor:null})}));
 render(<OwnCatalogReviewList imageId="target"/>);
 await waitFor(()=>expect(targetCalls).toBe(1));
 fireEvent.focus(window);
 await screen.findByRole("link", {name:"post"});
 await act(async()=>{if(outcome==="success")first.resolve(responseFor("pending"));else first.reject(new Error("old request"));});
 expect(screen.getByRole("link", {name:"post"})).toBeInTheDocument();
 expect(screen.queryByText("waiting")).not.toBeInTheDocument();
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("先頭更新の失敗は次ページではなく先頭を再試行する",async()=>{
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({items:[review],nextCursor:"0:20"})})
   .mockRejectedValueOnce(new Error("refresh failed"))
   .mockResolvedValueOnce({ok:true,json:async()=>({items:[{...review,status:"approved"}],nextCursor:"0:20"})});
 render(<OwnCatalogReviewList/>);
 await screen.findByRole("button",{name:"submit"});
 fireEvent.click(screen.getByRole("button",{name:"refresh"}));
 await screen.findByRole("alert");
 fireEvent.click(screen.getByRole("button",{name:"retry"}));
 await screen.findByRole("link",{name:"post"});
 expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(Array(3).fill("/api/catalog-references/reviews"));
 expect(screen.getAllByTestId("catalog-review-card")).toHaveLength(1);
});

test("通知対象の更新失敗時は古い対象で一覧の最新状態を隠さない",async()=>{
 let calls=0;let listCalls=0;
 fetchMock.mockImplementation((url:string)=>url.includes("imageId=")
   ? (++calls===1?Promise.resolve(responseFor("approved")):Promise.reject(new Error("target failed")))
   : Promise.resolve({ok:true,json:async()=>({items:[{...review,status:"approved",isPosted:++listCalls>1}],nextCursor:null})}));
 render(<OwnCatalogReviewList imageId="target"/>);
 await screen.findByRole("link",{name:"post"});
 fireEvent.click(screen.getByRole("button",{name:"refresh"}));
 await screen.findByRole("alert");
 await screen.findByText("posted");
 expect(screen.queryByRole("link",{name:"post"})).not.toBeInTheDocument();
});

test("通知対象を変更して取得に失敗しても前の作品を残さない",async()=>{
 const newTarget=deferredResponse();
 fetchMock.mockImplementation((url:string)=>url.includes("imageId=target")?Promise.resolve(responseFor("approved"))
   : url.includes("imageId=")?newTarget.promise
   : Promise.resolve({ok:true,json:async()=>({items:[],nextCursor:null})}));
 const {rerender}=render(<OwnCatalogReviewList imageId="target"/>);
 await screen.findByRole("link",{name:"post"});
 rerender(<OwnCatalogReviewList imageId="new-target"/>);
 expect(screen.queryByRole("link",{name:"post"})).not.toBeInTheDocument();
 await act(async()=>newTarget.reject(new Error("target missing")));
 await screen.findByRole("alert");
 expect(screen.queryByRole("link",{name:"post"})).not.toBeInTheDocument();
 expect(screen.queryByTestId("catalog-review-card")).not.toBeInTheDocument();
});


test.each(["not_submitted","pending","approved","rejected"] as const)("%sはマイページと共通の状態チップで表示し、4段階の進捗を出さない",status=>{
 render(<CatalogReviewCard review={{...review,status}}/>);
 const chip=screen.getByText(`badge_${status}`).closest('[data-slot="badge"]');
 expect(chip).toHaveAttribute("data-variant","outline");
 const backgrounds={not_submitted:"bg-slate-50/95",pending:"bg-sky-50/95",approved:"bg-emerald-50/95",rejected:"bg-rose-50/95"};
 expect(chip).toHaveClass(backgrounds[status]);
 expect(screen.queryByRole("list",{name:"progress"})).not.toBeInTheDocument();
});

test("サムネイル用パネルはチップから本人の作品詳細へ進み、画像プレビューを開かない",async()=>{
 fetchMock.mockResolvedValue({ok:true,json:async()=>({review:{...review,status:"not_submitted"}})});
 const preview=jest.fn(),loaded=jest.fn();
 render(<div onClick={preview}><OwnCatalogReviewPanel imageId="target" onReviewLoaded={loaded} presentation="thumbnail"/></div>);
 const chip=await screen.findByRole("link",{name:"badge_not_submitted"});
 expect(chip).toHaveAttribute("href","/posts/target");
 expect(screen.queryByTestId("catalog-review-card")).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"submit"})).not.toBeInTheDocument();
 fireEvent.click(chip);expect(preview).not.toHaveBeenCalled();
 expect(loaded).toHaveBeenCalledWith("target",expect.objectContaining({status:"not_submitted"}));
 expect(fetchMock).toHaveBeenCalledTimes(1);
});
