/** @jest-environment jsdom */
import {act,renderHook} from "@testing-library/react";
import {useCatalogReviewPosting} from "@/features/catalog-references/lib/use-catalog-review-posting";
import type {OwnCatalogReview} from "@/features/catalog-references/lib/review-status";
const review:OwnCatalogReview={imageId:"image",status:"pending",reasonCategory:null,reason:null,updatedAt:"now",imageUrl:null,isPosted:false,available:true};
test.each(["not_submitted","pending","rejected"] as const)("%s は既存の投稿操作も止める",status=>{
 const {result}=renderHook(()=>useCatalogReviewPosting());act(()=>result.current.onReviewLoaded("image",{...review,status}));expect(result.current.canPost("image")).toBe(false);
});
test("審査対象外・承認後だけ投稿可能で、非表示になれば止まる",()=>{
 const {result}=renderHook(()=>useCatalogReviewPosting());act(()=>result.current.onReviewLoaded("image",null));expect(result.current.canPost("image")).toBe(true);
 act(()=>result.current.onReviewLoaded("image",{...review,status:"approved"}));expect(result.current.canPost("image")).toBe(true);
 act(()=>result.current.onReviewLoaded("image",{...review,status:"approved",available:false}));expect(result.current.canPost("image")).toBe(false);
});

test("未取得と失敗では投稿を保留し、正常な審査対象外と区別する",()=>{
 const {result}=renderHook(()=>useCatalogReviewPosting());expect(result.current.canPost("image")).toBe(false);
 act(()=>result.current.onReviewLoaded("image",null));expect(result.current.canPost("image")).toBe(true);
 act(()=>result.current.onReviewLoaded("image",undefined));expect(result.current.canPost("image")).toBe(false);
});
