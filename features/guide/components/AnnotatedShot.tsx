import Image from "next/image";
import { cn } from "@/lib/utils";

/** 画像に対する割合(%)で持つ位置。撮り直しても画像の大きさに左右されない。 */
export interface ShotBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 吹き出しの三角の向き(どちらにある枠を指すか)。"none" は三角なしのラベル。 */
export type CalloutPointer = "down" | "up" | "up-end" | "left" | "none";

export interface ShotCallout {
  left: number;
  top: number;
  text: string;
  pointer: CalloutPointer;
  /** left を吹き出しの中心にする(三角なしのラベルを画像の上に中央そろえで置くとき) */
  center?: boolean;
}

interface AnnotatedShotProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  rings?: ShotBox[];
  callouts?: ShotCallout[];
  /** スマホの外枠で囲む(画面まるごとのスクショ)。部分の切り抜きは囲まない。 */
  device?: boolean;
  className?: string;
}

const POINTER_CLASS: Record<CalloutPointer, string> = {
  down: "after:left-5 after:top-full after:border-t-rose-500",
  up: "after:left-5 after:bottom-full after:border-b-rose-500",
  "up-end": "after:right-5 after:bottom-full after:border-b-rose-500",
  left: "after:right-full after:top-1/2 after:-translate-y-1/2 after:border-r-rose-500",
  none: "after:hidden",
};

/**
 * 実際の画面のスクショに、押す場所の枠と吹き出しを重ねる。
 *
 * 吹き出しの文字は画像に焼き込まず HTML の文字で重ねる。画像は日本語版1種類のまま、
 * 文字だけ各言語に切り替えるため(docs/planning/gacha-guide-page-plan.md 4.2)。
 */
export function AnnotatedShot({
  src,
  alt,
  width,
  height,
  rings = [],
  callouts = [],
  device = false,
  className,
}: AnnotatedShotProps) {
  return (
    <figure
      className={cn(
        // 吹き出しが画像の外にはみ出せるよう、上下に余白をとって overflow は切らない
        "relative mx-auto my-7 w-full bg-white shadow-[0_8px_24px_rgba(27,29,42,0.12)]",
        device
          ? "max-w-[300px] rounded-[30px] border-[6px] border-gray-900"
          : "max-w-[340px] rounded-2xl",
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(min-width: 860px) 340px, 90vw"
        className={cn("block h-auto w-full", device ? "rounded-[24px]" : "rounded-2xl")}
      />
      {rings.map((ring, index) => (
        <span
          key={`ring-${index}`}
          aria-hidden
          data-testid="shot-ring"
          className="pointer-events-none absolute rounded-xl border-[3px] border-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.25)] motion-safe:animate-pulse"
          style={{
            left: `${ring.left}%`,
            top: `${ring.top}%`,
            width: `${ring.width}%`,
            height: `${ring.height}%`,
          }}
        />
      ))}
      {callouts.map((callout, index) => (
        <span
          key={`callout-${index}`}
          aria-hidden
          className={cn(
            // 訳によっては長くなるので、画像の幅をはみ出さないよう折り返す
            "absolute w-max rounded-2xl bg-rose-500 px-3 py-1 leading-snug text-[13px] font-extrabold text-white shadow-[0_3px_0_rgba(0,0,0,0.15)]",
            "after:absolute after:border-[7px] after:border-transparent after:content-['']",
            POINTER_CLASS[callout.pointer],
          )}
          style={{
            left: `${callout.left}%`,
            top: `${callout.top}%`,
            maxWidth: callout.center
              ? "90%"
              : `${Math.max(30, Math.min(62, 98 - callout.left))}%`,
            transform: callout.center ? "translateX(-50%)" : undefined,
          }}
        >
          {callout.text}
        </span>
      ))}
    </figure>
  );
}
