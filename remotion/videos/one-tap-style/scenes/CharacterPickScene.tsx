import {spring, useCurrentFrame, useVideoConfig} from "remotion";
import {palette} from "../config";
import {fadeIn, riseIn, scaleIn} from "../helpers";
import {
  AppHeader,
  ChoicePill,
  PhoneShell,
  ReferenceCard,
  SceneBackground,
  SceneTextBlock,
  SectionTitle,
  SoftPanel,
  TapIndicator,
  ValueBadge,
} from "../shared";
import type {
  OneTapStylePromoCopy,
  OneTapStylePromoResolvedStyleOption,
} from "../types";

export const CharacterPickScene = ({
  copy,
  selectedStyle,
  characterImageUrl,
}: {
  copy: OneTapStylePromoCopy;
  selectedStyle: OneTapStylePromoResolvedStyleOption;
  characterImageUrl: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phoneProgress = spring({frame, fps, config: {damping: 180}});
  const uploadProgress = spring({
    frame: frame - 14,
    fps,
    config: {damping: 170},
  });

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
          title={copy.sectionCharacterTitle}
          description={copy.sectionCharacterDescription}
        />

        <SoftPanel
          style={{
            padding: 14,
            minHeight: 360,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              height: "100%",
            }}
          >
            <div style={{position: "relative"}}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 28,
                  border: `2px dashed ${palette.line}`,
                  background: "rgba(255,255,255,0.54)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: 12,
                  color: palette.muted,
                }}
              >
                <div style={{fontSize: 56, lineHeight: 1}}>＋</div>
                <div style={{fontSize: 18, fontWeight: 800}}>{copy.sourceLabel}</div>
              </div>
              <ReferenceCard
                label={copy.sourceLabel}
                imageUrl={characterImageUrl}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: uploadProgress,
                  transform: `translateY(${(1 - uploadProgress) * 24}px) scale(${0.96 + uploadProgress * 0.04})`,
                }}
              />
              <TapIndicator
                accent={palette.coral}
                style={{
                  right: 16,
                  bottom: 16,
                  opacity: fadeIn(frame, 22, 12),
                }}
              />
            </div>

            <ReferenceCard
              label={copy.styleLabel}
              imageUrl={selectedStyle.imageUrl}
              style={{height: "100%"}}
            />
          </div>
        </SoftPanel>

        <SoftPanel
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div>
            <div
              style={{
                marginBottom: 10,
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 900,
              }}
            >
              {copy.sourceTypeLabel}
            </div>
            <div style={{display: "flex", gap: 10}}>
              <ChoicePill label={copy.sourceTypePrimary} selected />
              <ChoicePill label={copy.sourceTypeSecondary} selected={false} />
            </div>
          </div>
          <div>
            <div
              style={{
                marginBottom: 10,
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 900,
              }}
            >
              {copy.modelLabel}
            </div>
            <div
              style={{
                height: 60,
                borderRadius: 22,
                background: "rgba(255,255,255,0.92)",
                border: `1px solid ${palette.line}`,
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 700,
                color: palette.muted,
              }}
            >
              {copy.modelValue}
            </div>
          </div>
        </SoftPanel>
      </PhoneShell>

      <SceneTextBlock
        title={copy.stepCharacter}
        body={copy.stepCharacterBody}
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
