/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {GeneratedImageGallery} from "@/features/generation/components/GeneratedImageGallery";
import {GeneratedImageList} from "@/features/generation/components/GeneratedImageList";
import type {GeneratedImageData} from "@/features/generation/types";
jest.mock("next-intl",()=>({useTranslations:()=> (key:string)=>key,useLocale:()=>"ja"}));
jest.mock("next/navigation",()=>({useRouter:()=>({push:jest.fn()})}));
jest.mock("@/features/generation/components/ImageModal",()=>({ImageModal:({canPostImage}:{canPostImage?:(id:string)=>boolean})=><div data-testid="modal-post-allowed">{String(canPostImage?.("image"))}</div>}));
const image={id:"image",url:"https://example.test/image.webp",is_posted:false} as GeneratedImageData;
function show(kind:string){return render(kind==="gallery"?<GeneratedImageGallery images={[image]}/>:<GeneratedImageList images={[image]} detailFromParam="free" returnToImageIdKey="test" applyActionMode="dispatch-event" generationType="free"/>);}
beforeEach(()=>{window.matchMedia=jest.fn().mockReturnValue({matches:false,addEventListener:jest.fn(),removeEventListener:jest.fn()});});
test.each(["gallery","list"])("%s で確認中は既存投稿ボタンと拡大画面の投稿を止める",async kind=>{
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({review:{imageId:"image",status:"pending",available:true,isPosted:false}})});
 show(kind);await screen.findByText("badge_pending");
 await waitFor(()=>expect(screen.queryAllByRole("button",{name:"postAction"})).toHaveLength(0));
 fireEvent.click(screen.getByRole("button",{name:"previewAction"}));expect(screen.getByTestId("modal-post-allowed")).toHaveTextContent("false");
});
test.each(["gallery","list"])("%s で審査のない画像の既存投稿を維持する",async kind=>{
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({review:null})});show(kind);
 await waitFor(()=>expect(global.fetch).toHaveBeenCalled());expect((await screen.findAllByRole("button",{name:"postAction"})).length).toBeGreaterThan(0);
});

test.each(["gallery","list"])("%s で未取得・失敗時は投稿を保留する",async kind=>{
 let reject:(error:Error)=>void=()=>{};
 global.fetch=jest.fn().mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));show(kind);
 expect(screen.queryAllByRole("button",{name:"postAction"})).toHaveLength(0);
 reject(new Error("offline"));await screen.findByRole("link",{name:"title"});expect(screen.queryAllByRole("button",{name:"postAction"})).toHaveLength(0);
});


test.each(["gallery","list"])("%sの審査状態は画像内チップだけで表示する",async kind=>{
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({review:{imageId:"image",status:"not_submitted",available:true,isPosted:false}})});
 show(kind);
 const chip=await screen.findByRole("link",{name:"badge_not_submitted"});
 expect(chip).toHaveAttribute("href","/posts/image");
 expect(chip.parentElement?.querySelector("img")).not.toBeNull();
 expect(chip).toHaveClass("absolute","bottom-0","left-2");
 expect(chip.closest("button")).toBeNull();
 expect(screen.queryByTestId("catalog-review-card")).not.toBeInTheDocument();
 expect(screen.queryByRole("list",{name:"progress"})).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"postAction"})).not.toBeInTheDocument();
});
