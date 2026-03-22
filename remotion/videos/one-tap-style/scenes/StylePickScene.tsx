import {Img, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {clamp, palette} from "../config";
import {fadeIn, riseIn, scaleIn} from "../helpers";
import {
  AppHeader,
  PhoneShell,
  SceneBackground,
  SceneTextBlock,
  SectionTitle,
  SoftPanel,
  StyleOptionCard,
  TapIndicator,
  ValueBadge,
} from "../shared";
import type {
  OneTapStylePromoCopy,
  OneTapStylePromoResolvedStyleOption,
} from "../types";

export const StylePickScene = ({
  copy,
  styleOptions,
  selectedStyleId,
}: {
  copy: OneTapStylePromoCopy;
  styleOptions: readonly OneTapStylePromoResolvedStyleOption[];
  selectedStyleId: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phoneProgress = spring({frame, fps, config: {damping: 180}});
  const selectedProgress = spring({
    frame: frame - 40,
    fps,
    config: {damping: 170},
  });
  const carouselTranslate = interpolate(frame, [0, 24, 58], [-500, -196, 0], clamp);
  const selectedStyle =
    styleOptions.find((styleOption) => styleOption.id === selectedStyleId) ??
    styleOptions[0];

  if (!selectedStyle) {
    return null;
  }

  // Calculate visible style based on carousel scroll position
  const cardSlotWidth = 196; // 180px card + 16px gap
  const phoneContentWidth = 512; // 560 - 24*2
  const visibleCenterOffset = -carouselTranslate + phoneContentWidth / 2;
  const visibleStyleIndex = Math.min(
    styleOptions.length - 1,
    Math.max(0, Math.round(visibleCenterOffset / cardSlotWidth)),
  );
  const visibleStyle = styleOptions[visibleStyleIndex] ?? selectedStyle;

  return (
    <SceneBackground>
      <ValueBadge
        label={copy.valueBadge}
        accent={palette.sky}
        style={{
          position: "absolute",
          top: 62,
          right: 72,
          opacity: fadeIn(frame, 4, 14),
          transform: `translateY(${riseIn(frame, 4, 18)}px) scale(${scaleIn(frame, 4, 0.96)})`,
        }}
      />

      <PhoneShell
        style={{
          left: 82,
          top: 74,
          opacity: phoneProgress,
          transform: `translateY(${(1 - phoneProgress) * 32}px) scale(${0.97 + phoneProgress * 0.03})`,
        }}
      >
        <AppHeader title={copy.pageTitle} description={copy.pageDescription} />
        <SectionTitle
          title={copy.sectionStyleTitle}
          description={copy.sectionStyleDescription}
        />

        <div
          style={{
            position: "relative",
            height: 274,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              transform: `translateX(${carouselTranslate}px)`,
            }}
          >
            {styleOptions.map((styleOption) => {
              const selected = styleOption.id === selectedStyleId;

              return (
                <div key={styleOption.id} style={{position: "relative"}}>
                  <StyleOptionCard
                    imageUrl={styleOption.imageUrl}
                    label={styleOption.name}
                    accent={styleOption.accent}
                    selected={selected}
                    style={{
                      transform: selected
                        ? `translateY(${-14 * selectedProgress}px) scale(${1 + selectedProgress * 0.04})`
                        : undefined,
                    }}
                  />
                  {selected && (
                    <div
                      style={{
                        position: "absolute",
                        top: -10,
                        right: -10,
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        background: styleOption.accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: 20,
                        fontWeight: 900,
                        boxShadow: `0 6px 18px ${styleOption.accent}55`,
                        opacity: selectedProgress,
                        transform: `scale(${0.5 + selectedProgress * 0.5}) translateY(${-14 * selectedProgress}px)`,
                      }}
                    >
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <TapIndicator
            accent={palette.sky}
            style={{
              top: 90,
              left: 400,
              opacity: fadeIn(frame, 32, 10),
            }}
          />
        </div>

        <SoftPanel
          style={{
            padding: 16,
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 16,
            minHeight: 244,
          }}
        >
          <div
            style={{
              height: 242,
              borderRadius: 24,
              overflow: "hidden",
              background: "#f4f4f4",
            }}
          >
            <Img
              src={visibleStyle.imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
              }}
            />
          </div>
          <div style={{display: "flex", flexDirection: "column", justifyContent: "center"}}>
            <div
              style={{
                marginBottom: 10,
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 800,
                color: palette.muted,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Selected Style
            </div>
            <div
              style={{
                marginBottom: 12,
                fontSize: 28,
                lineHeight: 1.05,
                fontWeight: 900,
                letterSpacing: "-0.05em",
              }}
            >
              {visibleStyle.name}
            </div>
            <div
              style={{
                fontSize: 17,
                lineHeight: 1.5,
                color: palette.muted,
              }}
            >
              横スクロールでスタイルを選ぶだけ。難しい操作は必要ありません。
            </div>
          </div>
        </SoftPanel>
      </PhoneShell>

      <SceneTextBlock
        title={copy.stepStyle}
        body={copy.stepStyleBody}
        style={{
          left: 960,
          right: 0,
          top: 306,
          opacity: fadeIn(frame, 14, 16),
          transform: `translateY(${riseIn(frame, 14, 26)}px)`,
        }}
      />
    </SceneBackground>
  );
};
