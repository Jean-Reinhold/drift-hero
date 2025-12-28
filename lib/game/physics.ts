import { clamp } from "./utils";

export type Vec2 = { x: number; y: number };

export type CarState = {
  position: Vec2;
  velocity: Vec2;
  heading: number;
};

export type CarInput = {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
};

export type CarTuning = {
  accel: number;
  brakeForce: number;
  drag: number;
  lateralGrip: number;
  handbrakeGrip: number;
  steerStrength: number;
  maxSpeed: number;
};

export function createCarState(): CarState {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    heading: 0
  };
}

export function stepCar(
  state: CarState,
  input: CarInput,
  dt: number,
  tuning: CarTuning
): void {
  const forward = { x: Math.sin(state.heading), y: Math.cos(state.heading) };
  const right = { x: Math.cos(state.heading), y: -Math.sin(state.heading) };

  let vForward =
    state.velocity.x * forward.x + state.velocity.y * forward.y;
  let vSide = state.velocity.x * right.x + state.velocity.y * right.y;

  const accel = tuning.accel * input.throttle - tuning.brakeForce * input.brake;
  vForward += accel * dt;
  vForward = clamp(vForward, -tuning.maxSpeed * 0.35, tuning.maxSpeed);
  vForward *= Math.max(0, 1 - tuning.drag * dt);

  const speedRatio = clamp(Math.abs(vForward) / tuning.maxSpeed, 0, 1);
  const gripScale = clamp(1 - speedRatio * 0.35, 0.5, 1);
  const baseGrip = input.handbrake ? tuning.handbrakeGrip : tuning.lateralGrip;
  const grip = baseGrip * gripScale;
  vSide *= Math.max(0, 1 - grip * dt);

  const steerStrength = tuning.steerStrength * clamp(speedRatio, 0.25, 1);
  state.heading += input.steer * steerStrength * dt;

  state.velocity.x = forward.x * vForward + right.x * vSide;
  state.velocity.y = forward.y * vForward + right.y * vSide;

  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
}
