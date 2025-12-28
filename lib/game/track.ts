import { clamp } from "./utils";

export type TrackBand = {
  amplitude: number;
  frequency: number;
  phase: number;
};

export type TrackConfig = {
  width: number;
  bands: TrackBand[];
  seed: number;
};

export type TrackSample = {
  centerX: number;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
};

export function sampleTrack(config: TrackConfig, y: number): TrackSample {
  let centerX = 0;
  let derivative = 0;

  for (const band of config.bands) {
    const angle = y * band.frequency + band.phase;
    const sinValue = Math.sin(angle);
    const cosValue = Math.cos(angle);
    centerX += band.amplitude * sinValue;
    derivative += band.amplitude * band.frequency * cosValue;
  }

  const tangentLength = Math.hypot(derivative, 1) || 1;
  const tangent = {
    x: derivative / tangentLength,
    y: 1 / tangentLength
  };
  const normal = {
    x: -tangent.y,
    y: tangent.x
  };

  return { centerX, tangent, normal };
}

export function isOnTrack(
  config: TrackConfig,
  carX: number,
  carY: number,
  margin = 0.5
): boolean {
  // Use distance-to-curve instead of a simple X-offset-at-Y check.
  // The track is rendered as a constant-width strip around the centerline curve;
  // checking only `abs(x - centerX(y))` can incorrectly mark the car off-track on
  // sharp turns (the same places where the border self-intersection artifacts show up).
  const halfWidth = (config.width * clamp(margin, 0.1, 1)) / 2;
  const maxDistSq = halfWidth * halfWidth;

  // Find the closest centerline point near the car's Y.
  // A small local search is robust and fast enough for our band-limited curve.
  const searchWindow = Math.max(200, config.width * 1.5);
  const coarseStep = 10;

  let bestY = carY;
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (let y = carY - searchWindow; y <= carY + searchWindow; y += coarseStep) {
    const { centerX } = sampleTrack(config, y);
    const dx = carX - centerX;
    const dy = carY - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestY = y;
    }
  }

  // Refine around the best coarse match.
  const refineWindow = coarseStep;
  const fineStep = 2;
  for (let y = bestY - refineWindow; y <= bestY + refineWindow; y += fineStep) {
    const { centerX } = sampleTrack(config, y);
    const dx = carX - centerX;
    const dy = carY - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) bestDistSq = distSq;
    if (bestDistSq <= maxDistSq) return true;
  }

  return bestDistSq <= maxDistSq;
}
