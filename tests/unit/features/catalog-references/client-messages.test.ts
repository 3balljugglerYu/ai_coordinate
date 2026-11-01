/** @jest-environment node */
import {getClientMessages} from "@/i18n/messages";
import {locales} from "@/i18n/config";
test.each(locales)("%s の審査画面に翻訳を配信する",async locale=>{
 const messages=await getClientMessages(locale);expect(messages.catalogReview).toBeDefined();
 for(const key of ["title","progress","create","submit","pending","approved","rejected","not_submitted","waiting","guidelines","unavailable","sending","post","posted","remake","submitFailed","order","refresh","imageAlt","loading","loadFailed","retry","empty","more","remakeReady","remakeFailed"] as const){expect(messages.catalogReview[key].length).toBeGreaterThan(0);}
});
