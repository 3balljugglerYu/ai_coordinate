import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { GACHA_MAX_CANDIDATES, GACHA_MIN_CANDIDATES } from "@/shared/generation/gacha-prompt";
import { GACHA_SPLIT_PERCOIN_COST } from "@/shared/generation/gacha-split";
import { cn } from "@/lib/utils";
import { AnnotatedShot } from "./AnnotatedShot";

/*
  ガチャ機能の紹介ページ(/guide/gacha)の中身。計画書: docs/planning/gacha-guide-page-plan.md
  - 章ごとに画面の端まで色を敷く(白い枠で囲まない・横幅を狭く制限しない。2026-10-05 ユーザー指示)
  - 画面の名前は生成画面と同じ文言を差し込む(ページに書き写さない)
  - 画像は日本語版1種類を全言語で使い、吹き出しの文字だけ各言語にする
*/

const IMG = "/guide/gacha";

const SHOTS = {
  whereHome: { src: `${IMG}/where-1-home.jpg`, width: 780, height: 1328 },
  whereCatalog: { src: `${IMG}/where-2-catalog.jpg`, width: 780, height: 1328 },
  whereCreate: { src: `${IMG}/where-3-create.jpg`, width: 780, height: 1328 },
  step1: { src: `${IMG}/step-1-image.jpg`, width: 780, height: 700 },
  step2: { src: `${IMG}/step-2-prompt.jpg`, width: 780, height: 378 },
  step3: { src: `${IMG}/step-3-toggle.jpg`, width: 780, height: 460 },
  step4: { src: `${IMG}/step-4-gacha-field.jpg`, width: 780, height: 598 },
  step5Write: { src: `${IMG}/step-5-write.jpg`, width: 780, height: 1378 },
  step5Accept: { src: `${IMG}/step-5-accept.jpg`, width: 780, height: 928 },
  step5Done: { src: `${IMG}/step-5-done.jpg`, width: 780, height: 846 },
  step6: { src: `${IMG}/step-6-generate.jpg`, width: 780, height: 736 },
} as const;

const JOB_IMAGES = {
  flightAttendant: `${IMG}/job-flight-attendant.jpg`,
  weatherForecaster: `${IMG}/job-weather-forecaster.jpg`,
  potter: `${IMG}/job-potter.jpg`,
} as const;

/** 生成画像(縦長 3:4)を3枚並べる。 */
function Trio({ images }: { images: { src: string; alt: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {images.map((image, index) => (
        <Image
          key={`${image.src}-${index}`}
          src={image.src}
          alt={image.alt}
          width={360}
          height={480}
          sizes="(min-width: 860px) 200px, 30vw"
          className="aspect-[3/4] w-full rounded-xl object-cover"
        />
      ))}
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
        "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-rose-500 text-[17px] font-extrabold text-white",
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
  wide = false,
  children,
}: {
  number: ReactNode;
  title: string;
  badge?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-3.5", wide && "min-[860px]:col-span-2")}>
      <div className="flex items-center gap-3">
        {number}
        <h3 className="text-lg font-extrabold min-[860px]:text-[22px]">{title}</h3>
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

export async function GachaGuide() {
  const t = await getTranslations("gachaGuide");
  // 画面の名前は、生成画面・ナビ・タブと同じ文言を使う(書き写さない)
  const navT = await getTranslations("nav");
  const userStylesT = await getTranslations("userStyles");
  const freeT = await getTranslations("free");
  const coordinateT = await getTranslations("coordinate");

  const ui = {
    catalog: navT("catalog"),
    create: userStylesT("tabCreate"),
    createTitle: userStylesT("tabCreateTitle"),
    officialTitle: userStylesT("tabOfficialTitle"),
    userTitle: userStylesT("tabUserTitle"),
    promptLabel: freeT("promptLabel"),
    toggle: freeT("gachaToggleLabel"),
    fieldLabel: freeT("gachaFieldLabel"),
    splitButton: freeT("gachaSplitButton", { cost: GACHA_SPLIT_PERCOIN_COST }),
    accept: freeT("gachaSplitAccept"),
    addImage: coordinateT("addImage"),
    generate: coordinateT("generatingButton"),
  };

  // 候補の数の案内は、生成画面と同じ上限・下限を使う(上限を変えたときに案内が古くならないように)
  const candidateRange = { min: GACHA_MIN_CANDIDATES, max: GACHA_MAX_CANDIDATES };

  const jobs = {
    flightAttendant: t("jobFlightAttendant"),
    weatherForecaster: t("jobWeatherForecaster"),
    potter: t("jobPotter"),
  };
  const job = (key: keyof typeof jobs) => ({ src: JOB_IMAGES[key], alt: jobs[key] });

  return (
    // 見出しは文節で折り返す(日本語で「をなく／す」のように語の途中で切れないように。対応していないブラウザは今までどおり)
    <div
      className="min-h-screen bg-sky-50 text-slate-900 [&_h1]:[word-break:auto-phrase] [&_h2]:[word-break:auto-phrase] [&_h3]:[word-break:auto-phrase]"
      data-testid="gacha-guide"
    >
      {/* ① 新機能 */}
      <Band
        labelledBy="gacha-guide-hero"
        className="bg-gradient-to-br from-rose-400 to-orange-300 pb-16 pt-12 text-white"
      >
        <div className="grid items-center gap-8 min-[860px]:grid-cols-[1.05fr_1fr]">
          <div className="grid gap-[18px]">
            <Tag className="bg-amber-300 text-gray-900">{t("heroBadge")}</Tag>
            <h1
              id="gacha-guide-hero"
              className="whitespace-pre-line text-balance text-[clamp(24px,6.6vw,34px)] font-extrabold leading-tight min-[860px]:text-[56px]"
            >
              {t("heroTitle")}
            </h1>
            <p className="max-w-[34em] text-base font-semibold min-[860px]:text-lg">
              {t("heroQuestion", { createTitle: ui.createTitle })}
            </p>
            <p className="max-w-[34em] whitespace-pre-line text-base font-semibold">{t("heroLead")}</p>
          </div>
          <div className="grid gap-3.5">
            <CompareRow
              label={t("compareBefore")}
              sub={t("compareBeforeSub")}
              note={t("compareBeforeNote")}
              images={[job("flightAttendant"), job("flightAttendant"), job("weatherForecaster")]}
              muted
            />
            <CompareRow
              label={t("compareAfter")}
              sub={t("compareAfterSub")}
              note={t("compareAfterNote")}
              images={[job("potter"), job("flightAttendant"), job("weatherForecaster")]}
            />
          </div>
        </div>
      </Band>

      {/* ② できること */}
      <Band labelledBy="gacha-guide-uses" className="bg-sky-100">
        <Tag className="bg-blue-500 text-white">{t("usesTag")}</Tag>
        <h2 id="gacha-guide-uses" className="text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]">
          {t("usesTitle")}
        </h2>
        <div className="grid gap-9 min-[860px]:grid-cols-3 min-[860px]:gap-7">
          <div className="grid content-start gap-2.5">
            <h3 className="text-xl font-extrabold">🧑‍✈️ {t("useJobTitle")}</h3>
            <Trio images={[job("flightAttendant"), job("weatherForecaster"), job("potter")]} />
            <Note>{t("useJobText")}</Note>
          </div>
          <div className="grid content-start gap-2.5">
            <h3 className="text-xl font-extrabold">👗 {t("useOutfitTitle")}</h3>
            <Trio
              images={[
                { src: `${IMG}/outfit-kimono.jpg`, alt: t("outfitKimono") },
                { src: `${IMG}/outfit-knit-polo.jpg`, alt: t("outfitKnitPolo") },
                { src: `${IMG}/outfit-plaid-skirt.jpg`, alt: t("outfitPlaidSkirt") },
              ]}
            />
            <Note>{t("useOutfitText")}</Note>
          </div>
          <div className="grid content-start gap-2.5">
            <h3 className="text-xl font-extrabold">🫶 {t("useShareTitle")}</h3>
            <div className="grid grid-cols-3 gap-1.5 text-center text-xs text-slate-600">
              {(
                [
                  ["A", "potter", "bg-blue-500"],
                  ["B", "flightAttendant", "bg-emerald-500"],
                  ["C", "weatherForecaster", "bg-amber-300"],
                ] as const
              ).map(([name, key, color]) => (
                <div key={name} className="grid justify-items-center gap-1">
                  <span
                    aria-hidden
                    className={cn("relative -mb-5 h-[30px] w-[30px] rounded-full border-[3px] border-sky-100", color)}
                  />
                  <Image
                    src={JOB_IMAGES[key]}
                    alt=""
                    width={360}
                    height={480}
                    sizes="(min-width: 860px) 200px, 30vw"
                    className="aspect-[3/4] w-full rounded-xl object-cover"
                  />
                  <span>{t("sharePerson", { name, job: jobs[key] })}</span>
                </div>
              ))}
            </div>
            <Note>{t("useShareText", { userTitle: ui.userTitle })}</Note>
          </div>
        </div>
      </Band>

      {/* ③ どこから使える？ */}
      <Band labelledBy="gacha-guide-where" className="bg-amber-100">
        <Tag className="bg-violet-500 text-white">{t("whereTag")}</Tag>
        <h2 id="gacha-guide-where" className="text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]">
          {t("whereTitle", { createTitle: ui.createTitle })}
        </h2>
        <ol className="grid gap-10 min-[860px]:grid-cols-3 min-[860px]:gap-7">
          <li className="grid min-w-0 justify-items-center gap-3 text-center">
            <StepNumber>1</StepNumber>
            <AnnotatedShot
              device
              // ラベルと枠の間に隙間をあける分、上の余白を広げる。3台そろえてパソコンで高さを合わせる(2026-10-05 ユーザー指示)
              className="mt-14"
              {...SHOTS.whereHome}
              alt={t("whereStep1Alt", { catalog: ui.catalog })}
              rings={[{ left: 21, top: 90, width: 18, height: 9.6 }]}
              callouts={[{ left: 8, top: 78, text: t("whereStep1Call", { catalog: ui.catalog }), pointer: "down" }]}
            />
            <p className="text-[15px] font-semibold">{t("whereStep1", { catalog: ui.catalog })}</p>
          </li>
          <li className="grid min-w-0 justify-items-center gap-3 text-center">
            <StepNumber>2</StepNumber>
            <AnnotatedShot
              device
              // ラベルと枠の間に隙間をあける分、上の余白を広げる。3台そろえてパソコンで高さを合わせる(2026-10-05 ユーザー指示)
              className="mt-14"
              {...SHOTS.whereCatalog}
              alt={t("whereStep2Alt", { create: ui.create, officialTitle: ui.officialTitle })}
              rings={[{ left: 70, top: 17, width: 26.5, height: 8.3 }]}
              callouts={[{ left: 40, top: 28, text: t("whereStep2Call", { create: ui.create }), pointer: "up-end" }]}
            />
            <p className="text-[15px] font-semibold">{t("whereStep2", { create: ui.create })}</p>
          </li>
          <li className="grid min-w-0 justify-items-center gap-3 text-center">
            <StepNumber>3</StepNumber>
            <AnnotatedShot
              device
              // ラベルと枠の間に隙間をあける分、上の余白を広げる。3台そろえてパソコンで高さを合わせる(2026-10-05 ユーザー指示)
              className="mt-14"
              {...SHOTS.whereCreate}
              alt={t("whereStep3Alt", { createTitle: ui.createTitle })}
              rings={[{ left: 3, top: 9.5, width: 62, height: 7 }]}
              // 吹き出しにせず、ラベルとして画面の外(上)に中央そろえで置く(2026-10-05 ユーザー指示)。
              // 画面の中に置くと、訳によってはタブや説明文に重なるため
              callouts={[{ left: 50, top: -9.6, text: t("whereStep3Call"), pointer: "none", center: true }]}
            />
            <p className="text-[15px] font-semibold">{t("whereStep3", { createTitle: ui.createTitle })}</p>
          </li>
        </ol>
        <div className="flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-slate-600">
          <span>💻 {t("wherePc", { catalog: ui.catalog })}</span>
          <span>🔑 {t("whereLogin")}</span>
        </div>
      </Band>

      {/* ④ 使い方 */}
      <Band labelledBy="gacha-guide-how" className="bg-emerald-50">
        <Tag className="bg-emerald-600 text-white">{t("howTag")}</Tag>
        <h2 id="gacha-guide-how" className="text-balance text-[26px] font-extrabold leading-snug min-[860px]:text-[40px]">
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
              rings={[{ left: 9.5, top: 21, width: 82, height: 65 }]}
              callouts={[{ left: 40, top: -5, text: t("step2Call"), pointer: "down" }]}
            />
            <Note>{t("step2Text")}</Note>
          </Step>
          <Step number={<StepNumber>3</StepNumber>} title={t("step3Title", { toggle: ui.toggle })}>
            <AnnotatedShot
              {...SHOTS.step3}
              alt={t("step3Alt", { promptLabel: ui.promptLabel, toggle: ui.toggle })}
              rings={[{ left: 8.5, top: 84, width: 52, height: 13 }]}
              callouts={[{ left: 63, top: 85.5, text: t("step3Call"), pointer: "left" }]}
            />
            <Note>{t("step3Text", { promptLabel: ui.promptLabel })}</Note>
          </Step>
          <Step number={<StepNumber>4</StepNumber>} title={t("step4Title")}>
            <AnnotatedShot
              {...SHOTS.step4}
              alt={t("step4Alt")}
              rings={[{ left: 12.6, top: 20.5, width: 78.4, height: 50 }]}
              callouts={[{ left: 46, top: -4, text: t("step4Call"), pointer: "down" }]}
            />
            <Note>{t("step4Text", candidateRange)}</Note>
          </Step>
          <Step
            number={<StepNumber>5</StepNumber>}
            title={t("step5Title")}
            badge={t("step5Badge")}
            wide
          >
            <Note>{t("step5Text", { fieldLabel: ui.fieldLabel })}</Note>
            <div className="grid justify-items-center gap-3.5 min-[860px]:grid-cols-[1fr_auto_1fr_auto_1fr] min-[860px]:items-start">
              <div className="grid w-full min-w-0 justify-items-center gap-2.5 text-center">
                <AnnotatedShot
                  {...SHOTS.step5Write}
                  alt={t("step5WriteAlt", { promptLabel: ui.promptLabel, splitButton: ui.splitButton })}
                  rings={[
                    { left: 9, top: 5, width: 82, height: 19.5 },
                    { left: 15.5, top: 92.3, width: 73, height: 7.2 },
                  ]}
                  callouts={[
                    { left: 40, top: -3.2, text: t("step5WriteCall"), pointer: "down" },
                    { left: 20, top: 101.5, text: t("step5TapCall"), pointer: "up" },
                  ]}
                />
                <p className="text-sm">{t("step5WriteText", { splitButton: ui.splitButton })}</p>
              </div>
              <FlowArrow />
              <div className="grid w-full min-w-0 justify-items-center gap-2.5 text-center">
                <AnnotatedShot
                  {...SHOTS.step5Accept}
                  alt={t("step5AcceptAlt", { accept: ui.accept })}
                  rings={[{ left: 15, top: 87, width: 25.5, height: 11 }]}
                  callouts={[{ left: 43, top: 88, text: t("step5TapCall"), pointer: "left" }]}
                />
                <p className="text-sm">{t("step5AcceptText", { accept: ui.accept })}</p>
              </div>
              <FlowArrow />
              <div className="grid w-full min-w-0 justify-items-center gap-2.5 text-center">
                <AnnotatedShot
                  {...SHOTS.step5Done}
                  alt={t("step5DoneAlt")}
                  rings={[{ left: 12.5, top: 56, width: 80, height: 38 }]}
                  callouts={[{ left: 47, top: 46, text: t("step5DoneCall"), pointer: "left" }]}
                />
                <p className="text-sm">{t("step5DoneText")}</p>
              </div>
            </div>
            <p className="text-[13px] text-slate-600">
              {t("step5Cost", { cost: GACHA_SPLIT_PERCOIN_COST })}
            </p>
          </Step>
          <Step number={<StepNumber>6</StepNumber>} title={t("step6Title")}>
            <AnnotatedShot
              {...SHOTS.step6}
              alt={t("step6Alt", { generate: ui.generate })}
              rings={[{ left: 9, top: 83.5, width: 82, height: 15 }]}
              callouts={[{ left: 20, top: 100.5, text: t("step6Call"), pointer: "up" }]}
            />
          </Step>
          <Step
            number={<StepNumber className="bg-amber-300 text-gray-900">★</StepNumber>}
            title={t("resultTitle")}
          >
            <Trio
              images={[
                { src: JOB_IMAGES.flightAttendant, alt: t("resultAlt", { count: 1, job: jobs.flightAttendant }) },
                { src: JOB_IMAGES.weatherForecaster, alt: t("resultAlt", { count: 2, job: jobs.weatherForecaster }) },
                { src: JOB_IMAGES.potter, alt: t("resultAlt", { count: 3, job: jobs.potter }) },
              ]}
            />
          </Step>
        </div>
      </Band>

      {/* ⑤ 締め */}
      <section aria-labelledby="gacha-guide-cta" className="bg-slate-900 px-4 py-14 text-center text-white">
        <div className="mx-auto grid max-w-[1200px] justify-items-center gap-4">
          <h2 id="gacha-guide-cta" className="text-balance text-2xl font-extrabold min-[860px]:text-4xl">
            {t("ctaTitle")}
          </h2>
          <Link
            href="/free"
            className="rounded-full bg-amber-300 px-10 py-4 text-lg font-extrabold text-gray-900 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-white"
          >
            {t("ctaButton")}
          </Link>
          <small className="text-white/75">{t("ctaNote", candidateRange)}</small>
        </div>
      </section>
    </div>
  );
}

function CompareRow({
  label,
  sub,
  note,
  images,
  muted = false,
}: {
  label: string;
  sub: string;
  note: string;
  images: { src: string; alt: string }[];
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5.5em_1fr] items-center gap-3">
      <span className="text-[15px] font-extrabold leading-tight">
        {label}
        <small className="block text-[11px] font-semibold opacity-85">{sub}</small>
      </span>
      <div className={cn("min-w-0", muted && "grayscale-[0.55] brightness-90")}>
        <Trio images={images} />
      </div>
      <span
        className={cn(
          "col-start-2 justify-self-start rounded-full px-3 py-0.5 text-sm font-extrabold",
          muted ? "bg-black/20" : "bg-amber-300 text-gray-900",
        )}
      >
        {note}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <span aria-hidden className="rotate-90 text-[28px] font-extrabold text-rose-500 min-[860px]:rotate-0 min-[860px]:self-center">
      →
    </span>
  );
}
