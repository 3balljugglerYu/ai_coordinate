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

export const riseIn = (
  frame: number,
  start: number,
  distance: number,
  duration = 18,
) => {
  return interpolate(frame, [start, start + duration], [distance, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
};

export const scaleIn = (
  frame: number,
  start: number,
  from = 0.94,
  duration = 18,
) => {
  return interpolate(frame, [start, start + duration], [from, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
};

export const pulse = (
  frame: number,
  minScale: number,
  maxScale: number,
  speed: number,
) => {
  return minScale + ((Math.sin(frame / speed) + 1) / 2) * (maxScale - minScale);
};
