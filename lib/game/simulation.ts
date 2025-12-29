import { clamp, lerp } from "./utils";
import {
  CarInput,
  CarState,
  CarTuning,
  Vec2,
  createCarState,
  stepCar
} from "./physics";
import { TrackConfig, isOnTrack, sampleTrack } from "./track";

export type Telemetry = {
  speed: number;
  driftAngle: number;
  score: number;
  multiplier: number;
  combo: number;
  onTrack: boolean;
};

export type SimulationState = {
  car: CarState;
  camera: Vec2;
  speed: number;
  driftAngle: number;
  score: number;
  multiplier: number;
  combo: number;
  onTrack: boolean;
  trackCheckTimer: number;
};

export const defaultTuning: CarTuning = {
  accel: 280,
  brakeForce: 110,
  drag: 0.6,
  lateralGrip: 1.8,
  handbrakeGrip: 1.8,
  steerStrength: 3.2,
  maxSpeed: 420
};

const TRACK_CHECK_INTERVAL = 0.12;
const TRACK_SAFE_INSIDE_RATIO = 0.7;
const TRACK_FORCE_CHECK_RATIO = 1.1;

export function createSimulationState(trackConfig: TrackConfig): SimulationState {
  const car = createCarState();
  const startSample = sampleTrack(trackConfig, car.position.y);
  car.position.x = startSample.centerX;

  return {
    car,
    camera: { x: car.position.x, y: car.position.y },
    speed: 0,
    driftAngle: 0,
    score: 0,
    multiplier: 1,
    combo: 0,
    onTrack: true,
    trackCheckTimer: 0
  };
}

export function stepSimulation(
  state: SimulationState,
  input: CarInput,
  dt: number,
  trackConfig: TrackConfig,
  tuning: CarTuning = defaultTuning
): void {
  stepCar(state.car, input, dt, tuning);

  const speed = Math.hypot(state.car.velocity.x, state.car.velocity.y);
  state.speed = speed;

  const velocityAngle = Math.atan2(state.car.velocity.x, state.car.velocity.y);
  state.driftAngle = normalizeAngle(velocityAngle - state.car.heading);

  const margin = 0.95;
  const halfWidth = (trackConfig.width * clamp(margin, 0.1, 1)) / 2;
  const sample = sampleTrack(trackConfig, state.car.position.y);
  const roughDist = Math.abs(state.car.position.x - sample.centerX);

  state.trackCheckTimer = Math.max(0, state.trackCheckTimer - dt);

  if (roughDist <= halfWidth * TRACK_SAFE_INSIDE_RATIO) {
    state.onTrack = true;
  } else if (
    state.trackCheckTimer <= 0 ||
    roughDist >= halfWidth * TRACK_FORCE_CHECK_RATIO
  ) {
    state.onTrack = isOnTrack(
      trackConfig,
      state.car.position.x,
      state.car.position.y,
      margin
    );
    state.trackCheckTimer = TRACK_CHECK_INTERVAL;
  }

  if (!state.onTrack) {
    state.car.velocity.x *= Math.max(0, 1 - dt * 2.4);
    state.car.velocity.y *= Math.max(0, 1 - dt * 2.4);
    state.combo = 0;
    state.multiplier = 1;
  }

  const driftIntensity = Math.abs(state.driftAngle);
  const driftActive = state.onTrack && speed > 25 && driftIntensity > 0.16;

  if (driftActive) {
    state.combo = clamp(state.combo + dt, 0, 4);
    if (state.combo > 1) {
      state.multiplier = clamp(state.multiplier + dt * 0.4, 1, 6);
    }
    const driftScore = speed * driftIntensity * 0.35;
    state.score += driftScore * state.multiplier * dt;
  } else {
    state.combo = clamp(state.combo - dt * 1.2, 0, 4);
    if (state.combo === 0) {
      state.multiplier = clamp(state.multiplier - dt * 1.5, 1, 6);
    }
  }

  // Frame-rate independent camera smoothing (feels consistent across FPS).
  state.camera.y = damp(state.camera.y, state.car.position.y, 0.22, dt);
  const { centerX } = sampleTrack(trackConfig, state.camera.y);
  state.camera.x = damp(state.camera.x, centerX, 0.32, dt);
}

export function getTelemetry(state: SimulationState): Telemetry {
  return {
    speed: state.speed,
    driftAngle: state.driftAngle,
    score: state.score,
    multiplier: state.multiplier,
    combo: state.combo,
    onTrack: state.onTrack
  };
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function damp(
  current: number,
  target: number,
  smoothTimeSeconds: number,
  dt: number
): number {
  if (smoothTimeSeconds <= 0) return target;
  const t = 1 - Math.exp(-dt / smoothTimeSeconds);
  return lerp(current, target, t);
}
