import {interpolate, useCurrentFrame} from "remotion";
import {AbsoluteFill} from "remotion";
import {clamp, fontFamily} from "../config";

export const CinematicTitleScene = ({text}: {text: string}) => {
  const frame = useCurrentFrame();

  const textOpacity = interpolate(frame, [0, 20, 60, 80], [0, 1, 1, 0], clamp);
  const textScale = interpolate(frame, [0, 20, 60, 80], [0.92, 1, 1, 1.04], clamp);
  const letterSpacing = interpolate(frame, [0, 20, 60, 80], [0.3, 0.08, 0.08, 0.14], clamp);

  return (
    <AbsoluteFill
      style={{
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: `${letterSpacing}em`,
          opacity: textOpacity,
          transform: `scale(${textScale})`,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
