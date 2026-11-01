/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import {render,screen} from "@testing-library/react";
import {MyImageCard} from "@/features/my-page/components/MyImageCard";
import type {GeneratedImageRecord} from "@/features/generation/lib/database";
jest.mock("next-intl",()=>({useTranslations:()=> (key:string)=>key}));
jest.mock("next/image",()=>({__esModule:true,default:({alt,src}:{alt:string;src:string})=><span role="img" aria-label={alt} data-src={src}/>}));
jest.mock("@/features/posts/lib/utils",()=>({getPostThumbUrl:()=>"https://cdn/sample.webp"}));
const image:GeneratedImageRecord={id:"image",user_id:"owner",image_url:"https://cdn/sample.webp",storage_path:"sample",prompt:"",is_posted:false};
test.each(["not_submitted","pending","rejected","approved"] as const)("本人のサムネイルに%sを表示する",status=>{
 render(<MyImageCard image={{...image,catalog_review_status:status}} currentUserId="owner"/>);
 expect(screen.getByText(`badge_${status}`)).toBeInTheDocument();expect(screen.getByRole("link")).toHaveAttribute("href","/posts/image?from=my-page");
});
test("審査対象でない作品と他人の画面に審査状態を出さない",()=>{
 const {rerender}=render(<MyImageCard image={image} currentUserId="owner"/>);expect(screen.queryByText(/badge_/)).not.toBeInTheDocument();
 rerender(<MyImageCard image={{...image,catalog_review_status:"rejected"}} currentUserId="another"/>);expect(screen.queryByText(/badge_/)).not.toBeInTheDocument();
});
test("選択中も状態を残し、投稿済みラベルを追加しない",()=>{
 render(<MyImageCard image={{...image,catalog_review_status:"approved",is_posted:true}} currentUserId="owner" selectionMode/>);
 expect(screen.getByText("badge_approved")).toBeInTheDocument();expect(screen.queryByRole("link")).not.toBeInTheDocument();expect(screen.queryByText("投稿済み")).not.toBeInTheDocument();
});
