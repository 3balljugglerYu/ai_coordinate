import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import {
  NAME_INPUT_HINT_MAX_LENGTH,
  NAME_INPUT_LABEL_MAX_LENGTH,
  NAME_INPUT_MAX_LENGTH,
} from "@/shared/generation/name-input";
import { NAME_INPUT_CREATE_PERCOIN_COST } from "@/shared/generation/name-input-create";
import { cn } from "@/lib/utils";
import { AnnotatedShot } from "./AnnotatedShot";
import { FloatingGuideCta } from "./FloatingGuideCta";

/*
  文字入力の紹介ページ(/guide/text)の中身。ガチャの紹介ページ(GachaGuide)と同じ作り
  (docs/planning/name-input-slot-plan.md Phase 6。見本: https://claude.ai/artifact/3wfKhZiHUr16Fv15BdyFDz)。
  - 章ごとに画面の端まで色を敷く(白い枠で囲まない・横幅を狭く制限しない)
  - 色はガチャのページ(ピンク・オレンジ)と別にする。同じに見えると、同じ機能の案内に見えるため(2026-10-07 ユーザー指摘)
  - 吹き出しの枠の位置は、撮影したときの要素の位置から割合で出す(目分量で置くとずれる)
  - 画面の名前は生成画面と同じ文言を差し込む(ページに書き写さない)
  - 画像は日本語版1種類を全言語で使い、吹き出しの文字だけ各言語にする
  - 「どこから使える？」の画面・画像の選び方・生成ボタンは、ガチャのページと同じ画像を使う
*/

const IMG = "/guide/text";
const GACHA_IMG = "/guide/gacha";

const SHOTS = {
  whereHome: { src: `${GACHA_IMG}/where-1-home.jpg`, width: 780, height: 1328 },
  whereCatalog: { src: `${GACHA_IMG}/where-2-catalog.jpg`, width: 780, height: 1328 },
  whereCreate: { src: `${GACHA_IMG}/where-3-create.jpg`, width: 780, height: 1328 },
  step1: { src: `${GACHA_IMG}/step-1-image.jpg`, width: 780, height: 700 },
  step2: { src: `${IMG}/step-2-prompt.jpg`, width: 780, height: 424 },
  step3: { src: `${IMG}/step-3-on.jpg`, width: 780, height: 642 },
  step4: { src: `${IMG}/step-4-settings.jpg`, width: 780, height: 642 },
  step5: { src: `${IMG}/step-support.jpg`, width: 780, height: 436 },
  step6Trial: { src: `${IMG}/step-5-trial.jpg`, width: 780, height: 208 },
  step6Generate: { src: `${GACHA_IMG}/step-6-generate.jpg`, width: 780, height: 736 },
  userSheet: { src: `${IMG}/user-sheet.jpg`, width: 780, height: 1414 },
} as const;

/**
 * 生成例(入れた文字が画像に入ったもの)。運営から届いたら、ここに足す(`public/guide/text/` に置く)。
 * 届くまでは点線の枠を出す(公開前は運営だけに見えるページ)。
 */
const EXAMPLES: { src: string; text: string }[] = [];

/** 生成例を3枚並べる。足りない分は点線の枠(仮置き)。 */
function ExampleTrio({
  texts,
  altFor,
  placeholderLabel,
  tone = "light",
}: {
  texts: string[];
  altFor: (text: string) => string;
  placeholderLabel: string;
  tone?: "light" | "onColor";
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {texts.map((text, index) => {
        const example = EXAMPLES.find((item) => item.text === text);
        return example ? (
          <Image
            key={`${text}-${index}`}
            src={example.src}
            alt={altFor(text)}
            width={360}
            height={480}
            sizes="(min-width: 860px) 200px, 30vw"
            className="aspect-[3/4] w-full rounded-xl object-cover"
          />
        ) : (
          <div
            key={`${text}-${index}`}
            role="img"
            aria-label={altFor(text)}
            className={cn(
              "grid aspect-[3/4] w-full min-w-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed p-1.5 text-center text-xs font-extrabold [overflow-wrap:anywhere]",
              tone === "onColor" ? "border-white/90 text-white" : "border-slate-400 text-slate-500",
            )}
            data-testid="text-guide-example-placeholder"
          >
            <span>
              {placeholderLabel}
              <span className="block text-base">{text}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Band({
  className,
  labelledBy,
  children,
}: {
  className: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    // 吹き出しが画像の外へ出ても、ページが横にスクロールしないよう切る
    <section aria-labelledby={labelledBy} className={cn("overflow-x-clip px-4 py-14", className)}>
      <div className="mx-auto grid max-w-[1200px] gap-7">{children}</div>
    </section>
  );
}

function Tag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "justify-self-start rounded-full px-3.5 py-1 text-[13px] font-extrabold tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}

function StepNumber({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-indigo-500 text-[17px] font-extrabold text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Step({
  number,
  title,
  badge,
  children,
}: {
  number: ReactNode;
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-3.5">
      <div className="flex items-center gap-3">
        {number}
        <h3 className="min-w-0 text-lg font-extrabold min-[860px]:text-[22px]">{title}</h3>
        {badge ? (
          <span className="shrink-0 rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-extrabold text-gray-900">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-600">{children}</p>;
}

export async function TextGuide() {
  const t = await getTranslations("textGuide");
  // 画面の名前は、生成画面・ナビ・タブと同じ文言を使う(書き写さない)
  const navT = await getTranslations("nav");
  const userStylesT = await getTranslations("userStyles");
  const freeT = await getTranslations("free");
  const coordinateT = await getTranslations("coordinate");
  const postsT = await getTranslations("posts");
  // 「どこから使える？」はガチャのページと同じ画像・吹き出しなので、文言もそちらを使う
  const gachaT = await getTranslations("gachaGuide");

  const ui = {
    catalog: navT("catalog"),
    create: userStylesT("tabCreate"),
    createTitle: userStylesT("tabCreateTitle"),
    userTitle: userStylesT("tabUserTitle"),
    promptLabel: freeT("promptLabel"),
    optionsTitle: freeT("promptGimmicksTitle"),
    toggle: freeT("nameInputToggleLabel"),
    labelSetting: freeT("nameInputLabelSetting"),
    hintSetting: freeT("nameInputPlaceholderSetting"),
    createButton: freeT("nameInputCreateButton", { cost: NAME_INPUT_CREATE_PERCOIN_COST }),
    gachaToggle: freeT("gachaToggleLabel"),
    addImage: coordinateT("addImage"),
    generate: coordinateT("generatingButton"),
    useCatalog: postsT("feedUseCatalog"),
  };

  const limits = {
    max: NAME_INPUT_MAX_LENGTH,
    labelMax: NAME_INPUT_LABEL_MAX_LENGTH,
    hintMax: NAME_INPUT_HINT_MAX_LENGTH,
    cost: NAME_INPUT_CREATE_PERCOIN_COST,
  };

  // 生成例の文字(画像に入っている文字。言語によらず同じ)
  const sampleTexts = [t("sampleText1"), t("sampleText2"), t("sampleText3")];
  const exampleAlt = (text: string) => t("exampleAlt", { text });

  return (
    // 見出しは文節で折り返す(日本語で語の途中で切れないように。対応していないブラウザは今までどおり)
    <div
      className="min-h-screen bg-indigo-50 text-slate-900 [&_h1]:[word-break:auto-phrase] [&_h2]:[word-break:auto-phrase] [&_h3]:[word-break:auto-phrase]"
      data-testid="text-guide"
    >
      {/* ① 新機能 */}
      <Band
        labelledBy="text-guide-hero"
        className="bg-gradient-to-br from-indigo-500 to-sky-400 pb-16 pt-12 text-white"
      >
        <div className="grid items-center gap-8 min-[860px]:grid-cols-[1.05fr_1fr]">
          <div className="grid min-w-0 gap-[18px]">
            <Tag className="bg-amber-300 text-gray-900">{t("heroBadge")}</Tag>
            <h1
              id="text-guide-hero"
              className="whitespace-pre-line text-balance text-[clamp(28px,7.5vw,38px)] font-extrabold leading-tight min-[860px]:text-[56px]"
            >
              {t("heroTitle")}
            </h1>
            <p className="max-w-[34em] text-base font-semibold min-[860px]:text-lg">{t("heroQuestion")}</p>
            <p className="max-w-[34em] text-base font-semibold">{t("heroLead")}</p>
          </div>
          <div className="grid min-w-0 grid-cols-[5.5em_minmax(0,1fr)] items-center gap-3">
            <span className="text-[15px] font-extrabold leading-tight">
              {t("heroCompareLabel")}
              <small className="block text-[11px] font-semibold opacity-85">{t("heroCompareSub")}</small>
            </span>
            <ExampleTrio
              texts={sampleTexts}
              altFor={exampleAlt}
              placeholderLabel={t("examplePlaceholder")}
              tone="onColor"
            />
            <span className="col-start-2 justify-self-start rounded-full bg-amber-300 px-3 py-0.5 text-sm font-extrabold text-gray-900">
              {t("heroCompareNote")}
            </span>
          </div>
        </div>
      </Band>

      {/* ② できること */}
      <Band labelledBy="text-guide-uses" className="bg-violet-50">
        <Tag className="bg-violet-500 text-white">{t("usesTag")}</Tag>
        <h2 id="text-guide-uses" className="text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]">
          {t("usesTitle")}
        </h2>
        <div className="grid gap-9 min-[860px]:grid-cols-3 min-[860px]:gap-7">
          <div className="grid min-w-0 content-start gap-2.5">
            <h3 className="text-xl font-extrabold">🐱 {t("useNameTitle")}</h3>
            <ExampleTrio
              texts={[t("useNameSample1"), t("useNameSample2"), t("useNameSample3")]}
              altFor={exampleAlt}
              placeholderLabel={t("examplePlaceholder")}
            />
            <Note>{t("useNameText")}</Note>
          </div>
          <div className="grid min-w-0 content-start gap-2.5">
            <h3 className="text-xl font-extrabold">✍️ {t("useWordTitle")}</h3>
            <ExampleTrio
              texts={[t("useWordSample1"), t("useWordSample2"), t("useWordSample3")]}
              altFor={exampleAlt}
              placeholderLabel={t("examplePlaceholder")}
            />
            <Note>{t("useWordText")}</Note>
          </div>
          <div className="grid min-w-0 content-start gap-2.5">
            <h3 className="text-xl font-extrabold">🫶 {t("useShareTitle")}</h3>
            <ExampleTrio texts={sampleTexts} altFor={exampleAlt} placeholderLabel={t("examplePlaceholder")} />
            <Note>{t("useShareText", { userTitle: ui.userTitle })}</Note>
          </div>
        </div>
      </Band>

      {/* ③ どこから使える？(ガチャのページと同じ画面・吹き出し) */}
      <Band labelledBy="text-guide-where" className="bg-lime-50">
        <Tag className="bg-lime-600 text-white">{gachaT("whereTag")}</Tag>
        <h2 id="text-guide-where" className="text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]">
          {gachaT("whereTitle", { createTitle: ui.createTitle })}
        </h2>
        <ol className="grid gap-10 min-[860px]:grid-cols-3 min-[860px]:gap-7">
          <li className="grid min-w-0 justify-items-center gap-3 text-center">
            <StepNumber>1</StepNumber>
            <AnnotatedShot
              device
              className="mt-14"
              {...SHOTS.whereHome}
              alt={gachaT("whereStep1Alt", { catalog: ui.catalog })}
              rings={[{ left: 21, top: 90, width: 18, height: 9.6 }]}
              callouts={[{ left: 8, top: 78, text: gachaT("whereStep1Call", { catalog: ui.catalog }), pointer: "down" }]}
            />
            <p className="text-[15px] font-semibold">{gachaT("whereStep1", { catalog: ui.catalog })}</p>
          </li>
          <li className="grid min-w-0 justify-items-center gap-3 text-center">
            <StepNumber>2</StepNumber>
            <AnnotatedShot
              device
              className="mt-14"
              {...SHOTS.whereCatalog}
              alt={gachaT("whereStep2Alt", { create: ui.create, officialTitle: userStylesT("tabOfficialTitle") })}
              rings={[{ left: 70, top: 17, width: 26.5, height: 8.3 }]}
              callouts={[{ left: 40, top: 28, text: gachaT("whereStep2Call", { create: ui.create }), pointer: "up-end" }]}
            />
            <p className="text-[15px] font-semibold">{gachaT("whereStep2", { create: ui.create })}</p>
          </li>
          <li className="grid min-w-0 justify-items-center gap-3 text-center">
            <StepNumber>3</StepNumber>
            <AnnotatedShot
              device
              className="mt-14"
              {...SHOTS.whereCreate}
              alt={gachaT("whereStep3Alt", { createTitle: ui.createTitle })}
              rings={[{ left: 3, top: 9.5, width: 62, height: 7 }]}
              callouts={[{ left: 50, top: -9.6, text: gachaT("whereStep3Call"), pointer: "none", center: true }]}
            />
            <p className="text-[15px] font-semibold">{gachaT("whereStep3", { createTitle: ui.createTitle })}</p>
          </li>
        </ol>
        <div className="flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-slate-600">
          <span>💻 {gachaT("wherePc", { catalog: ui.catalog })}</span>
          <span>🔑 {gachaT("whereLogin")}</span>
        </div>
      </Band>

      {/* ④ 使い方(作る人) */}
      <Band labelledBy="text-guide-how" className="bg-orange-50">
        <Tag className="bg-orange-500 text-white">{t("howTag")}</Tag>
        <h2
          id="text-guide-how"
          className="whitespace-pre-line text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]"
        >
          {t("howTitle")}
        </h2>
        <div className="grid gap-12 min-[860px]:grid-cols-2 min-[860px]:gap-x-12 min-[860px]:gap-y-14">
          <Step number={<StepNumber>1</StepNumber>} title={t("step1Title")}>
            <AnnotatedShot
              {...SHOTS.step1}
              alt={t("step1Alt")}
              rings={[{ left: 9, top: 21, width: 82, height: 63 }]}
              callouts={[{ left: 50, top: -6, text: ui.addImage, pointer: "down" }]}
            />
          </Step>
          <Step number={<StepNumber>2</StepNumber>} title={t("step2Title")}>
            <AnnotatedShot
              {...SHOTS.step2}
              alt={t("step2Alt", { promptLabel: ui.promptLabel })}
              rings={[{ left: 9.5, top: 19, width: 81, height: 69 }]}
              callouts={[{ left: 40, top: -5, text: t("step2Call"), pointer: "down" }]}
            />
            <Note>{t("step2Text")}</Note>
          </Step>
          <Step number={<StepNumber>3</StepNumber>} title={t("step3Title", { toggle: ui.toggle })}>
            <AnnotatedShot
              {...SHOTS.step3}
              alt={t("step3Alt", { optionsTitle: ui.optionsTitle, toggle: ui.toggle })}
              rings={[{ left: 12, top: 16, width: 76, height: 12 }]}
              callouts={[{ left: 44, top: -6, text: t("step3Call"), pointer: "down" }]}
            />
            <Note>
              {t("step3Text", { promptLabel: ui.promptLabel, optionsTitle: ui.optionsTitle, gachaToggle: ui.gachaToggle })}
            </Note>
          </Step>
          <Step number={<StepNumber>4</StepNumber>} title={t("step4Title", { label: ui.labelSetting, hint: ui.hintSetting })}>
            <AnnotatedShot
              {...SHOTS.step4}
              alt={t("step4Alt", { label: ui.labelSetting, hint: ui.hintSetting })}
              rings={[{ left: 15.5, top: 33.5, width: 71, height: 48 }]}
              callouts={[{ left: 16, top: -4, text: t("step4Call"), pointer: "down" }]}
            />
            <Note>{t("step4Text", { label: ui.labelSetting, hint: ui.hintSetting, ...limits })}</Note>
          </Step>
          <Step number={<StepNumber>5</StepNumber>} title={t("step5Title")} badge={t("step5Badge")}>
            <AnnotatedShot
              {...SHOTS.step5}
              alt={t("step5Alt", { createButton: ui.createButton })}
              rings={[{ left: 19, top: 61.5, width: 65.5, height: 30 }]}
              callouts={[{ left: 14, top: 100, text: t("step5Call"), pointer: "up" }]}
            />
            <Note>{t("step5Text", limits)}</Note>
          </Step>
          <Step number={<StepNumber>6</StepNumber>} title={t("step6Title")}>
            <AnnotatedShot
              {...SHOTS.step6Trial}
              alt={t("step6TrialAlt")}
              rings={[{ left: 16, top: 28, width: 71.5, height: 43 }]}
              callouts={[{ left: 20, top: 100, text: t("step6TrialCall"), pointer: "up" }]}
            />
            <AnnotatedShot
              className="mt-10"
              {...SHOTS.step6Generate}
              alt={t("step6GenerateAlt", { generate: ui.generate })}
              rings={[{ left: 9, top: 83.5, width: 82, height: 15 }]}
              callouts={[{ left: 20, top: 100.5, text: t("step6GenerateCall"), pointer: "up" }]}
            />
            <Note>{t("step6Text", limits)}</Note>
          </Step>
          <Step
            number={<StepNumber className="bg-amber-300 text-gray-900">★</StepNumber>}
            title={t("resultTitle")}
          >
            <ExampleTrio texts={sampleTexts} altFor={exampleAlt} placeholderLabel={t("examplePlaceholder")} />
          </Step>
        </div>
      </Band>

      {/* ⑤ 使う人の画面 */}
      <Band labelledBy="text-guide-user" className="bg-cyan-50">
        <Tag className="bg-cyan-600 text-white">{t("userTag")}</Tag>
        <h2 id="text-guide-user" className="text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]">
          {t("userTitle")}
        </h2>
        <div className="grid items-center gap-8 min-[860px]:grid-cols-2">
          <AnnotatedShot
            device
            className="mt-12"
            {...SHOTS.userSheet}
            alt={t("userAlt", { useCatalog: ui.useCatalog })}
            rings={[{ left: 9, top: 84, width: 82, height: 12.5 }]}
            callouts={[{ left: 14, top: 73, text: t("userCall"), pointer: "down" }]}
          />
          <ul className="grid list-disc gap-2 pl-5 text-[15px]">
            <li>{t("userPoint1", { userTitle: ui.userTitle, useCatalog: ui.useCatalog })}</li>
            <li>{t("userPoint2", { label: ui.labelSetting })}</li>
            <li>{t("userPoint3", limits)}</li>
            <li>{t("userPoint4")}</li>
          </ul>
        </div>
      </Band>

      {/* ⑥ 締め。ここまで来たら浮かぶボタンを隠し、この章のボタンに任せる(FloatingGuideCta) */}
      <section
        id="text-guide-closing"
        aria-labelledby="text-guide-cta"
        className="bg-indigo-950 px-4 py-14 text-center text-white"
      >
        <div className="mx-auto grid max-w-[1200px] justify-items-center gap-4">
          <h2 id="text-guide-cta" className="text-balance text-2xl font-extrabold min-[860px]:text-4xl">
            {t("ctaTitle")}
          </h2>
          <Link
            href="/free"
            className="rounded-full bg-amber-300 px-10 py-4 text-lg font-extrabold text-gray-900 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-white"
          >
            {t("ctaButton")}
          </Link>
          <small className="text-white/75">{t("ctaNote", limits)}</small>
        </div>
      </section>

      {/* どこまで読んでいても押せるよう、画面の下に浮かべる(ガチャのページと同じ) */}
      <FloatingGuideCta href="/free" label={t("ctaButton")} dockTargetId="text-guide-closing" />
    </div>
  );
}
