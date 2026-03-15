import {Easing, interpolate} from "remotion";
import {clamp} from "./config";

export const float = (
  frame: number,
  speed: number,
  amplitude: number,
  phase = 0,
) => {
  return Math.sin((frame + phase) / speed) * amplitude;
};

export const fadeIn = (frame: number, start: number, duration: number) => {
  return interpolate(frame, [start, start + duration], [0, 1], clamp);
};

export const riseIn = (frame: number, start: number, distance: number) => {
  return interpolate(frame, [start, start + 18], [distance, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
};

export const scaleIn = (frame: number, start: number) => {
  return interpolate(frame, [start, start + 18], [0.94, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
};
