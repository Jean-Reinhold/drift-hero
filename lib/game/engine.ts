import { createCarState, stepCar, CarInput, CarTuning } from "./physics";
import { clamp, lerp } from "./utils";
import { TrackConfig, isOnTrack, sampleTrack } from "./track";
import { createAsphaltPattern, renderFrame } from "./render";

export type Telemetry = {
  speed: number;
  driftAngle: number;
  score: number;
  multiplier: number;
  combo: number;
  onTrack: boolean;
};

export type GameEngine = {
  updateTrack: (config: TrackConfig) => void;
  destroy: () => void;
};

const defaultTuning: CarTuning = {
  accel: 140,
  brakeForce: 110,
  drag: 0.85,
  lateralGrip: 6.2,
  handbrakeGrip: 2.2,
  steerStrength: 2.6,
  maxSpeed: 240
};

const keyMap = new Map<string, keyof InputState>([
  ["w", "up"],
  ["arrowup", "up"],
  ["s", "down"],
  ["arrowdown", "down"],
  ["a", "left"],
  ["arrowleft", "left"],
  ["d", "right"],
  ["arrowright", "right"],
  [" ", "handbrake"]
]);

type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
};

export function createEngine(
  canvas: HTMLCanvasElement,
  initialTrack: TrackConfig,
  onTelemetry?: (telemetry: Telemetry) => void
): GameEngine {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  let trackConfig = initialTrack;
  const car = createCarState();
  car.position.y = 0;
  car.heading = 0;
  const startSample = sampleTrack(trackConfig, car.position.y);
  car.position.x = startSample.centerX;

  let score = 0;
  let multiplier = 1;
  let combo = 0;
  let driftAngle = 0;
  let onTrack = true;

  const camera = { x: car.position.x, y: car.position.y };
  const anchor = { x: 0, y: 0 };

  const inputState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false
  };

  let asphalt = createAsphaltPattern(ctx);
  let raf = 0;
  let lastTime = performance.now();
  let lastTelemetry = 0;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    anchor.x = clientWidth / 2;
    anchor.y = clientHeight * 0.74;
    asphalt = createAsphaltPattern(ctx);
  };

  const handleKey = (event: KeyboardEvent, next: boolean) => {
    const key = event.key.toLowerCase();
    const mapped = keyMap.get(key);
    if (!mapped) return;
    inputState[mapped] = next;
    if (
      key === " " ||
      key.startsWith("arrow") ||
      key === "w" ||
      key === "a" ||
      key === "s" ||
      key === "d"
    ) {
      event.preventDefault();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => handleKey(event, true);
  const onKeyUp = (event: KeyboardEvent) => handleKey(event, false);

  const onBlur = () => {
    inputState.up = false;
    inputState.down = false;
    inputState.left = false;
    inputState.right = false;
    inputState.handbrake = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", resize);
  resize();

  const update = (dt: number) => {
    const input: CarInput = {
      throttle: inputState.up ? 1 : 0,
      brake: inputState.down ? 1 : 0,
      steer: (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0),
      handbrake: inputState.handbrake
    };

    stepCar(car, input, dt, defaultTuning);

    const speed = Math.hypot(car.velocity.x, car.velocity.y);
    const velocityAngle = Math.atan2(car.velocity.x, car.velocity.y);
    driftAngle = normalizeAngle(velocityAngle - car.heading);

    onTrack = isOnTrack(trackConfig, car.position.x, car.position.y, 0.95);

    if (!onTrack) {
      car.velocity.x *= Math.max(0, 1 - dt * 2.4);
      car.velocity.y *= Math.max(0, 1 - dt * 2.4);
      combo = 0;
      multiplier = 1;
    }

    const driftIntensity = Math.abs(driftAngle);
    const driftActive = onTrack && speed > 25 && driftIntensity > 0.16;

    if (driftActive) {
      combo = clamp(combo + dt, 0, 4);
      if (combo > 1) {
        multiplier = clamp(multiplier + dt * 0.4, 1, 6);
      }
      const driftScore = speed * driftIntensity * 0.35;
      score += driftScore * multiplier * dt;
    } else {
      combo = clamp(combo - dt * 1.2, 0, 4);
      if (combo === 0) {
        multiplier = clamp(multiplier - dt * 1.5, 1, 6);
      }
    }

    camera.y = lerp(camera.y, car.position.y, 0.1);
    const { centerX } = sampleTrack(trackConfig, camera.y);
    camera.x = lerp(camera.x, centerX, 0.08);

    return { speed };
  };

  const loop = (time: number) => {
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    const { speed } = update(dt);

    renderFrame({
      ctx,
      canvas,
      config: trackConfig,
      car,
      camera,
      anchor,
      asphalt
    });

    if (onTelemetry && time - lastTelemetry > 120) {
      lastTelemetry = time;
      onTelemetry({
        speed,
        driftAngle,
        score,
        multiplier,
        combo,
        onTrack
      });
    }

    raf = window.requestAnimationFrame(loop);
  };

  raf = window.requestAnimationFrame(loop);

  return {
    updateTrack: (config: TrackConfig) => {
      trackConfig = config;
    },
    destroy: () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", resize);
    }
  };
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}
