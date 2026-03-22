import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {clamp, fontFamily, palette, phoneFrame} from "./config";

export const SceneBackground = ({
  children,
  imageUrl,
  imageOpacity = 0.14,
}: {
  children: ReactNode;
  imageUrl?: string;
  imageOpacity?: number;
}) => {
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #fff8f1 0%, #fff2e6 52%, #f1f9ff 100%)",
        color: palette.ink,
        fontFamily,
        overflow: "hidden",
      }}
    >
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{
            position: "absolute",
            inset: -120,
            width: "calc(100% + 240px)",
            height: "calc(100% + 240px)",
            objectFit: "cover",
            opacity: imageOpacity,
            filter: "blur(34px) saturate(1.06)",
            transform: "scale(1.08)",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 14% 16%, rgba(255,180,92,0.28), transparent 26%), radial-gradient(circle at 80% 20%, rgba(110,178,255,0.22), transparent 24%), radial-gradient(circle at 74% 82%, rgba(114,213,187,0.2), transparent 24%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.36) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.36) 1px, transparent 1px)",
          backgroundSize: "112px 112px",
          opacity: 0.18,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const BrandLockup = ({
  iconUrl,
  caption,
  style,
}: {
  iconUrl: string;
  caption: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.84)",
        border: `1px solid ${palette.line}`,
        boxShadow: "0 16px 40px rgba(255,162,130,0.14)",
        backdropFilter: "blur(16px)",
        ...style,
      }}
    >
      <Img
        src={iconUrl}
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          boxShadow: "0 14px 24px rgba(110,178,255,0.24)",
        }}
      />
      <div style={{display: "flex", flexDirection: "column", gap: 2}}>
        <div
          style={{
            fontSize: 24,
            lineHeight: 1,
            fontWeight: 700,
            letterSpacing: "-0.04em",
          }}
        >
          Persta.AI
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.2,
            color: palette.muted,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {caption}
        </div>
      </div>
    </div>
  );
};

export const ValueBadge = ({
  label,
  accent = palette.coral,
  style,
}: {
  label: string;
  accent?: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 18px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.82)",
        border: `1px solid ${accent}33`,
        boxShadow: `0 12px 32px ${accent}22`,
        fontSize: 20,
        lineHeight: 1,
        fontWeight: 800,
        letterSpacing: "-0.03em",
        ...style,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: accent,
          boxShadow: `0 0 16px ${accent}`,
        }}
      />
      {label}
    </div>
  );
};

export const StepPill = ({
  label,
  style,
}: {
  label: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px 26px",
        borderRadius: 999,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(255,248,240,0.88) 100%)",
        border: `1px solid ${palette.line}`,
        boxShadow: "0 24px 54px rgba(255,159,122,0.16)",
        fontSize: 28,
        lineHeight: 1,
        fontWeight: 900,
        letterSpacing: "-0.04em",
        ...style,
      }}
    >
      {label}
    </div>
  );
};

export const SoftPanel = ({
  style,
  children,
}: {
  style?: CSSProperties;
  children: ReactNode;
}) => {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 32,
        background: "rgba(255,255,255,0.84)",
        border: `1px solid ${palette.line}`,
        boxShadow: "0 20px 48px rgba(255,165,124,0.14)",
        backdropFilter: "blur(18px)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const PhoneShell = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => {
  return (
    <SoftPanel
      style={{
        position: "absolute",
        width: phoneFrame.width,
        height: phoneFrame.height,
        borderRadius: phoneFrame.radius,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,252,248,0.92) 100%)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          width: 140,
          height: 10,
          borderRadius: 999,
          transform: "translateX(-50%)",
          background: "rgba(32,48,77,0.12)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "40px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {children}
      </div>
    </SoftPanel>
  );
};

export const AppHeader = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 18,
        }}
      >
        <div
          style={{
            fontSize: 42,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: "-0.06em",
          }}
        >
          {title}
        </div>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            border: `1px solid ${palette.line}`,
            background: "rgba(255,255,255,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            color: palette.sky,
          }}
        >
          ✦
        </div>
      </div>
      <div
        style={{
          fontSize: 18,
          lineHeight: 1.45,
          color: palette.muted,
          letterSpacing: "-0.02em",
        }}
      >
        {description}
      </div>
    </div>
  );
};

export const SectionTitle = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  return (
    <div style={{display: "flex", flexDirection: "column", gap: 6}}>
      <div
        style={{
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: "-0.04em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 17,
          lineHeight: 1.45,
          color: palette.muted,
        }}
      >
        {description}
      </div>
    </div>
  );
};

export const SceneTextBlock = ({
  title,
  body,
  style,
}: {
  title: string;
  body: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        position: "absolute",
        width: 620,
        ...style,
      }}
    >
      <div
        style={{
          marginBottom: 20,
          fontSize: 68,
          lineHeight: 0.96,
          fontWeight: 900,
          letterSpacing: "-0.07em",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div
        style={{
          maxWidth: 560,
          fontSize: 28,
          lineHeight: 1.45,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: palette.muted,
        }}
      >
        {body}
      </div>
    </div>
  );
};

export const StyleOptionCard = ({
  imageUrl,
  label,
  accent,
  selected,
  style,
}: {
  imageUrl: string;
  label: string;
  accent: string;
  selected: boolean;
  style?: CSSProperties;
}) => {
  return (
    <SoftPanel
      style={{
        width: 180,
        height: 252,
        borderRadius: 24,
        background: selected ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.9)",
        border: selected ? `2px solid ${accent}` : `1px solid ${palette.line}`,
        boxShadow: selected
          ? `0 16px 36px ${accent}29`
          : "0 14px 30px rgba(32,48,77,0.08)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          top: 10,
          height: 196,
          borderRadius: 18,
          overflow: "hidden",
          background: "#f4f4f4",
        }}
      >
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top center",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 14,
          fontSize: 15,
          lineHeight: 1.15,
          fontWeight: 900,
          letterSpacing: "-0.03em",
        }}
      >
        {label}
      </div>
    </SoftPanel>
  );
};

export const ReferenceCard = ({
  label,
  imageUrl,
  style,
  imageFit = "cover",
}: {
  label: string;
  imageUrl: string;
  style?: CSSProperties;
  imageFit?: CSSProperties["objectFit"];
}) => {
  return (
    <SoftPanel
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          marginBottom: 10,
          fontSize: 17,
          lineHeight: 1,
          fontWeight: 800,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          borderRadius: 22,
          overflow: "hidden",
          background: "#f4f5f7",
        }}
      >
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: imageFit,
            objectPosition: "center top",
          }}
        />
      </div>
    </SoftPanel>
  );
};

export const ChoicePill = ({
  label,
  selected,
  style,
}: {
  label: string;
  selected: boolean;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 16px",
        minWidth: 112,
        borderRadius: 999,
        border: `1px solid ${selected ? palette.sky : palette.line}`,
        background: selected ? "rgba(110,178,255,0.12)" : "rgba(255,255,255,0.86)",
        color: selected ? palette.ink : palette.muted,
        fontSize: 16,
        lineHeight: 1,
        fontWeight: selected ? 800 : 700,
        boxShadow: selected ? "0 10px 22px rgba(110,178,255,0.14)" : "none",
        ...style,
      }}
    >
      {label}
    </div>
  );
};

export const PrimaryButton = ({
  label,
  style,
}: {
  label: string;
  style?: CSSProperties;
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 76,
        borderRadius: 26,
        background:
          "linear-gradient(135deg, rgba(255,127,115,1) 0%, rgba(255,180,92,1) 52%, rgba(110,178,255,0.96) 100%)",
        color: "#ffffff",
        fontSize: 24,
        lineHeight: 1,
        fontWeight: 900,
        letterSpacing: "-0.04em",
        boxShadow: "0 22px 44px rgba(255,140,104,0.28)",
        ...style,
      }}
    >
      {label}
    </div>
  );
};

export const ProgressCard = ({
  title,
  message,
  hint,
  progress,
  style,
}: {
  title: string;
  message: string;
  hint: string;
  progress: number;
  style?: CSSProperties;
}) => {
  return (
    <SoftPanel
      style={{
        padding: 22,
        ...style,
      }}
    >
      <div
        style={{
          marginBottom: 10,
          fontSize: 22,
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: "-0.03em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          minHeight: 48,
          marginBottom: 16,
          fontSize: 18,
          lineHeight: 1.45,
          color: palette.muted,
        }}
      >
        {message}
      </div>
      <div
        style={{
          height: 12,
          borderRadius: 999,
          background: "rgba(32,48,77,0.08)",
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(114,213,187,1) 0%, rgba(110,178,255,1) 100%)",
            boxShadow: "0 8px 16px rgba(110,178,255,0.2)",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.45,
          color: palette.muted,
        }}
      >
        {hint}
      </div>
    </SoftPanel>
  );
};

export const TapIndicator = ({
  accent = palette.coral,
  style,
}: {
  accent?: string;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const tapProgress = spring({frame, fps, config: {damping: 180}});
  const rippleScale = interpolate(frame, [0, 20, 36], [0.7, 1.1, 1.34], clamp);
  const rippleOpacity = interpolate(frame, [0, 18, 36], [0.34, 0.18, 0], clamp);

  return (
    <div
      style={{
        position: "absolute",
        width: 84,
        height: 84,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          border: `3px solid ${accent}`,
          opacity: rippleOpacity,
          transform: `scale(${rippleScale})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 18,
          borderRadius: 999,
          background: "rgba(255,255,255,0.96)",
          border: `2px solid ${accent}`,
          boxShadow: `0 16px 30px ${accent}2e`,
          transform: `scale(${0.92 + tapProgress * 0.08})`,
        }}
      />
    </div>
  );
};

export const FloatingResultCard = ({
  imageUrl,
  label,
  style,
}: {
  imageUrl: string;
  label: string;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();

  return (
    <SoftPanel
      style={{
        padding: 18,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 18,
          left: 18,
          padding: "10px 14px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.92)",
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 18,
          top: 54,
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 18px 40px rgba(32,48,77,0.14)",
        }}
      >
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${1.02 + frame * 0.0004})`,
          }}
        />
      </div>
    </SoftPanel>
  );
};
