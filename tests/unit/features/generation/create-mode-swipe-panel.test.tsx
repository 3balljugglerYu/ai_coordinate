/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { CreateModeSwipePanel } from "@/features/generation/components/CreateModeSwipePanel";

class TestPointerEvent extends MouseEvent {
 pointerId: number; pointerType: string; isPrimary: boolean;
 constructor(type:string,init:PointerEventInit={}) {
  super(type,init);this.pointerId=init.pointerId??1;this.pointerType=init.pointerType??"touch";this.isPrimary=init.isPrimary??true;
 }
}
beforeEach(()=>{window.PointerEvent=TestPointerEvent as typeof PointerEvent;});
function move(target:Element,from:[number,number],to:[number,number],kind="touch",end="pointerUp") {
 const props={pointerId:1,pointerType:kind,isPrimary:true,button:0};
 fireEvent.pointerDown(target,{...props,clientX:from[0],clientY:from[1]});
 const event=createEvent.pointerMove(target,{...props,clientX:to[0],clientY:to[1],cancelable:true});fireEvent(target,event);
 if(end==="pointerCancel")fireEvent.pointerCancel(target,props);
 else fireEvent.pointerUp(target,{...props,clientX:to[0],clientY:to[1]});
 return event;
}
function setup(mode:"prompt"|"reference"="prompt",enabled=true) {
 const change=jest.fn();
 const view=render(<CreateModeSwipePanel activeMode={mode} onModeChange={change} enabled={enabled}>
  <div data-testid="surface">surface</div><textarea aria-label="prompt" defaultValue="keep"/>
  <button type="button">pick</button><a href="#next">link</a>
 </CreateModeSwipePanel>);
 const panel=screen.getByTestId("create-mode-swipe-panel");
 Object.defineProperty(panel,"clientWidth",{value:400,configurable:true});
 return {...view,panel,change,surface:screen.getByTestId("surface")};
}
test.each(["touch","mouse"])("%sで左へ動かすとイラストへ、右へ動かすとプロンプトへ",kind=>{
 const first=setup();move(first.surface,[300,200],[100,200],kind);expect(first.change).toHaveBeenCalledTimes(1);expect(first.change).toHaveBeenCalledWith("reference");first.unmount();
 const second=setup("reference");move(second.surface,[100,200],[300,200],kind);expect(second.change).toHaveBeenCalledWith("prompt");
});
test.each([
 ["短い横移動",[200,200],[212,200]],
 ["縦スクロール",[200,200],[350,500]],
 ["縦優勢の斜め移動",[200,200],[350,400]],
 ["画面左端",[4,200],[200,200]],
] as const)("%sでは切り替えない",(_name,from,to)=>{
 const {surface,change}=setup("reference");const event=move(surface,[...from],[...to]);if(_name!=="短い横移動")expect(event.defaultPrevented).toBe(false);expect(change).not.toHaveBeenCalled();
});
test.each(["prompt","reference"] as const)("%sの外側へ払っても他タブへ行かない",mode=>{
 const {surface,change}=setup(mode);move(surface,mode==="prompt"?[100,200]:[300,200],mode==="prompt"?[300,200]:[100,200]);expect(change).not.toHaveBeenCalled();
});
test.each(["textbox","button","link"])("%sからの操作は横切替に使わない",role=>{
 const {change,panel}=setup();const target=screen.getByRole(role);const event=move(target,[300,200],[100,200]);expect(event.defaultPrevented).toBe(false);expect(change).not.toHaveBeenCalled();
 const click=jest.fn();panel.addEventListener("click",click);fireEvent.click(target);expect(click).toHaveBeenCalledTimes(1);
});
test("未招待者のフォームは横切替しない",()=>{const {surface,change}=setup("prompt",false);move(surface,[300,200],[100,200]);expect(change).not.toHaveBeenCalled();});
test("キャンセルと別pointerの終了では切り替えず、次の操作で切り替えられる",()=>{
 const {surface,change}=setup();move(surface,[300,200],[100,200],"touch","pointerCancel");expect(change).not.toHaveBeenCalled();
 fireEvent.pointerDown(surface,{pointerId:1,isPrimary:true,clientX:300,clientY:200});
 fireEvent.pointerMove(surface,{pointerId:2,isPrimary:true,clientX:100,clientY:200});
 fireEvent.pointerUp(surface,{pointerId:2,isPrimary:true,clientX:100,clientY:200});expect(change).not.toHaveBeenCalled();
 fireEvent.pointerCancel(surface,{pointerId:1});
 move(surface,[300,200],[100,200]);expect(change).toHaveBeenCalledTimes(1);
});
test("横ドラッグ後のクリックだけを捨て、通常の次のクリックは通す",()=>{
 const click=jest.fn();const {surface,panel}=setup();panel.addEventListener("click",click);
 move(surface,[300,200],[100,200]);fireEvent.click(surface);expect(click).not.toHaveBeenCalled();
 fireEvent.pointerDown(surface,{pointerId:1,isPrimary:true,clientX:200,clientY:200});fireEvent.pointerUp(surface,{pointerId:1,isPrimary:true,clientX:200,clientY:200});fireEvent.click(surface);expect(click).toHaveBeenCalledTimes(1);
});
test("モードが変わっても入力欄を作り直さず入力内容を保持する",()=>{
 function Example(){const [mode,setMode]=useState<"prompt"|"reference">("prompt");return <><p>{mode}</p><CreateModeSwipePanel activeMode={mode} onModeChange={setMode} enabled><textarea aria-label="draft"/><div data-testid="surface"/></CreateModeSwipePanel></>;}
 render(<Example/>);const input=screen.getByRole("textbox");fireEvent.change(input,{target:{value:"remember"}});
 move(screen.getByTestId("surface"),[300,200],[100,200]);expect(screen.getByText("reference")).toBeInTheDocument();expect(screen.getByRole("textbox")).toBe(input);expect(input).toHaveValue("remember");
});

test("縦と判定した後に横へ動いても縦スクロールのまま",()=>{
 const {surface,change}=setup();const props={pointerId:1,isPrimary:true};
 fireEvent.pointerDown(surface,{...props,clientX:300,clientY:200});
 fireEvent.pointerMove(surface,{...props,clientX:290,clientY:240});
 const event=createEvent.pointerMove(surface,{...props,clientX:100,clientY:240,cancelable:true});fireEvent(surface,event);
 fireEvent.pointerUp(surface,{...props,clientX:100,clientY:240});
 expect(change).not.toHaveBeenCalled();expect(event.defaultPrevented).toBe(false);
});
test("2本目の指が触れたら横切替を中止する",()=>{
 const {surface,change}=setup();fireEvent.pointerDown(surface,{pointerId:1,isPrimary:true,clientX:300,clientY:200});
 fireEvent.pointerDown(surface,{pointerId:2,isPrimary:false,clientX:320,clientY:200});
 fireEvent.pointerMove(surface,{pointerId:1,isPrimary:true,clientX:100,clientY:200});
 fireEvent.pointerUp(surface,{pointerId:1,isPrimary:true,clientX:100,clientY:200});expect(change).not.toHaveBeenCalled();
});
test.each([[400,79,false],[400,81,true],[1000,95,false],[1000,97,true]])("幅%sで%s移動の切替可否は%s",(width,distance,commit)=>{
 const {surface,panel,change}=setup();Object.defineProperty(panel,"clientWidth",{value:width});
 move(surface,[300,200],[300-distance,200]);expect(change).toHaveBeenCalledTimes(commit?1:0);
});
test("右端の戻る進む操作を奪わない",()=>{
 const {surface,change}=setup();move(surface,[window.innerWidth-4,200],[window.innerWidth-204,200]);expect(change).not.toHaveBeenCalled();
});
test("右から左へ並ぶ言語では切替方向も反転する",()=>{
 const {surface,panel,change}=setup();panel.setAttribute("dir","rtl");move(surface,[100,200],[300,200]);expect(change).toHaveBeenCalledWith("reference");
});

test.each(["child","other-pointer"])("%sのcapture解除では追跡中の横操作を止めない",source=>{
 const {surface,panel,change}=setup();const props={pointerId:1,isPrimary:true};
 fireEvent.pointerDown(surface,{...props,clientX:300,clientY:200});
 fireEvent.pointerMove(surface,{...props,clientX:260,clientY:200});
 fireEvent.lostPointerCapture(source==="child"?surface:panel,{pointerId:source==="child"?1:2});
 fireEvent.pointerMove(panel,{...props,clientX:100,clientY:200});
 fireEvent.pointerUp(panel,{...props,clientX:100,clientY:200});
 expect(change).toHaveBeenCalledWith("reference");
});
test("panel自身が追跡中pointerのcaptureを失った場合は切替を中止する",()=>{
 const {surface,panel,change}=setup();const props={pointerId:1,isPrimary:true};
 fireEvent.pointerDown(surface,{...props,clientX:300,clientY:200});
 fireEvent.pointerMove(surface,{...props,clientX:100,clientY:200});
 fireEvent.lostPointerCapture(panel,props);fireEvent.pointerUp(panel,{...props,clientX:100,clientY:200});expect(change).not.toHaveBeenCalled();
});
