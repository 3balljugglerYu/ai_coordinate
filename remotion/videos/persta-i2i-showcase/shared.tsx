import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {clamp, fontFamily, palette} from "./config";

export const HeadlineReveal = ({
  text,
  start,
  duration,
  style,
}: {
  text: string;
  start: number;
  duration: number;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const visibleChars = Math.floor(
    interpolate(frame, [start, start + duration], [0, text.length], clamp),
  );
  const cursorBlink = frame % 16 < 8 ? 1 : 0;

  return (
    <div style={style}>
      {text.slice(0, visibleChars)}
      <span style={{opacity: visibleChars < text.length ? cursorBlink : 0}}>|</span>
    </div>
  );
};

export const SceneBackground = ({
  accentA,
  accentB,
  accentC,
  children,
}: {
  accentA: string;
  accentB: string;
  accentC: string;
  children: ReactNode;
}) => {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 16% 18%, rgba(140,240,255,0.14), transparent 24%), radial-gradient(circle at 82% 12%, rgba(255,158,178,0.12), transparent 24%), linear-gradient(180deg, #050816 0%, #091124 42%, #050816 100%)",
        color: palette.text,
        fontFamily,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "110px 110px",
          opacity: 0.07,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 680,
          height: 680,
          top: -260,
          left: -120,
          borderRadius: "9999px",
          background: accentA,
          opacity: 0.22,
          filter: "blur(120px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          bottom: -220,
          right: -80,
          borderRadius: "9999px",
          background: accentB,
          opacity: 0.16,
          filter: "blur(120px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 1200,
          top: -140,
          left: 280,
          transform: "rotate(18deg)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.02) 28%, rgba(255,255,255,0) 100%)",
          opacity: 0.12,
          filter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 1200,
          top: -140,
          right: 260,
          transform: "rotate(-18deg)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 26%, rgba(255,255,255,0) 100%)",
          opacity: 0.12,
          filter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 106,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${accentC} 34%, transparent 100%)`,
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 24%, rgba(0,0,0,0.46) 100%)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const BrandBadge = () => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 999,
        background: "rgba(8, 14, 28, 0.62)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(18px)",
      }}
    >
      <Img
        src={staticFile("icons/icon-512.png")}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          boxShadow: "0 10px 24px rgba(46,98,255,0.38)",
        }}
      />
      <div style={{display: "flex", flexDirection: "column", gap: 2}}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.04em",
          }}
        >
          Persta.AI
        </div>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: palette.muted,
          }}
        >
          beta showcase
        </div>
      </div>
    </div>
  );
};

export const GlassPanel = ({
  style,
  children,
}: {
  style?: CSSProperties;
  children: ReactNode;
}) => {
  return (
    <div
      style={{
        position: "absolute",
        borderRadius: 34,
        overflow: "hidden",
        background: palette.panel,
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 28px 70px rgba(2, 8, 22, 0.4)",
        backdropFilter: "blur(22px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Tag = ({
  label,
  accent,
  style,
}: {
  label: string;
  accent: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        position: "absolute",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 18px",
        borderRadius: 999,
        background: "rgba(8, 14, 28, 0.74)",
        border: `1px solid ${accent}44`,
        color: palette.text,
        fontSize: 18,
        fontWeight: 600,
        boxShadow: `0 16px 36px ${accent}1f`,
        ...style,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: accent,
          boxShadow: `0 0 18px ${accent}`,
        }}
      />
      {label}
    </div>
  );
};

export const ShowcaseCard = ({
  src,
  label,
  caption,
  style,
  imageFit = "contain",
  padding = 24,
  children,
}: {
  src: string;
  label?: string;
  caption?: string;
  style?: CSSProperties;
  imageFit?: CSSProperties["objectFit"];
  padding?: number;
  children?: ReactNode;
}) => {
  const imageTop = label ? 70 : padding;
  const imageBottom = caption ? 96 : padding;

  return (
    <GlassPanel style={style}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 26%, rgba(0,0,0,0.28) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 18,
          top: 18,
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(7, 12, 24, 0.78)",
          border: "1px solid rgba(255,255,255,0.14)",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          display: label ? "inline-flex" : "none",
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          left: padding,
          right: padding,
          top: imageTop,
          bottom: imageBottom,
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: imageFit,
          }}
        />
      </div>
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: 22,
            right: 22,
            bottom: 20,
            fontSize: 26,
            lineHeight: 1.18,
            fontWeight: 700,
            letterSpacing: "-0.04em",
          }}
        >
          {caption}
        </div>
      ) : null}
      {children}
    </GlassPanel>
  );
};
