import type { CarInput, CarState, Vec2 } from "./physics";
import type { TrackConfig } from "./track";
import {
  createSimulationState,
  defaultTuning,
  getTelemetry,
  stepSimulation
} from "./simulation";
import type { Telemetry } from "./simulation";
import {
  createCanvasRenderer,
  createPixiRenderer,
  type RenderQuality,
  type Renderer
} from "./renderer";

export type { Telemetry } from "./simulation";

export type GameEngine = {
  updateTrack: (config: TrackConfig) => void;
  destroy: () => void;
};

export type EngineOptions = {
  renderer?: "pixi" | "canvas2d";
  useWorker?: boolean;
  fixedStep?: number;
  renderFps?: number;
  maxDpr?: number;
  quality?: RenderQuality;
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

const DEFAULT_FIXED_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.1;
const MAX_SIM_STEPS = 5;
const TELEMETRY_INTERVAL = 120;

const defaultQuality: RenderQuality = {
  environment: "low"
};

const defaultOptions: Required<EngineOptions> = {
  renderer: "pixi",
  useWorker: true,
  fixedStep: DEFAULT_FIXED_STEP,
  renderFps: 60,
  maxDpr: 0.85,
  quality: defaultQuality
};

type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
};

type SimulationSnapshot = {
  car: CarState;
  camera: Vec2;
  telemetry: Telemetry;
};

type WorkerMessageOut = {
  type: "state";
  snapshot: SimulationSnapshot;
};

export function createEngine(
  container: HTMLElement,
  initialTrack: TrackConfig,
  onTelemetry?: (telemetry: Telemetry) => void,
  options: EngineOptions = {}
): GameEngine {
  const settings = {
    ...defaultOptions,
    ...options,
    quality: { ...defaultQuality, ...options.quality }
  };

  let trackConfig = initialTrack;
  const simState = createSimulationState(trackConfig);
  const anchor = { x: 0, y: 0 };
  let canvas = document.createElement("canvas");
  canvas.className = "game-canvas__surface";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const inputState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false
  };

  let renderer: Renderer | null = null;
  let raf = 0;
  let lastTime = performance.now();
  let accumulator = 0;
  let lastTelemetry = 0;
  let lastRender = 0;
  let renderScale = settings.maxDpr;
  let lastScaleCheck = 0;
  let frameEmaMs = 16.7;
  let destroyed = false;

  let worker: Worker | null = null;
  let workerSnapshot: SimulationSnapshot | null = null;
  let displayCar: CarState = {
    position: { ...simState.car.position },
    velocity: { ...simState.car.velocity },
    heading: simState.car.heading
  };
  let displayCamera: Vec2 = { ...simState.camera };

  const buildInput = (): CarInput => ({
    throttle: inputState.up ? 1 : 0,
    brake: inputState.down ? 1 : 0,
    steer: (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0),
    handbrake: inputState.handbrake
  });

  const syncInput = () => {
    if (!worker) return;
    worker.postMessage({ type: "input", input: buildInput() });
  };

  const handleKey = (event: KeyboardEvent, next: boolean) => {
    const key = event.key.toLowerCase();
    const mapped = keyMap.get(key);
    if (!mapped) return;
    inputState[mapped] = next;
    syncInput();
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
    syncInput();
  };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    const dpr = Math.min(window.devicePixelRatio || 1, renderScale);
    anchor.x = clientWidth / 2;
    anchor.y = clientHeight * 0.74;
    renderer?.resize(clientWidth, clientHeight, dpr);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", resize);

  if (settings.useWorker && typeof Worker !== "undefined") {
    try {
      worker = new Worker(new URL("./physics-worker.ts", import.meta.url), {
        type: "module"
      });
      worker.onmessage = (event: MessageEvent<WorkerMessageOut>) => {
        if (event.data?.type === "state") {
          workerSnapshot = event.data.snapshot;
        }
      };
      worker.postMessage({
        type: "init",
        trackConfig,
        tuning: defaultTuning
      });
      syncInput();
    } catch (error) {
      worker = null;
    }
  }

  const updateLocal = (dt: number) => {
    stepSimulation(simState, buildInput(), dt, trackConfig, defaultTuning);
  };

  const smoothStep = (current: number, target: number, smoothTime: number, dt: number) => {
    if (smoothTime <= 0) return target;
    const t = 1 - Math.exp(-dt / smoothTime);
    return current + (target - current) * t;
  };

  const smoothAngle = (current: number, target: number, smoothTime: number, dt: number) => {
    if (smoothTime <= 0) return target;
    let delta = target - current;
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
    const t = 1 - Math.exp(-dt / smoothTime);
    return current + delta * t;
  };

  const updateDisplayState = (target: SimulationSnapshot, dt: number) => {
    displayCar.position.x = smoothStep(
      displayCar.position.x,
      target.car.position.x,
      0.08,
      dt
    );
    displayCar.position.y = smoothStep(
      displayCar.position.y,
      target.car.position.y,
      0.08,
      dt
    );
    displayCar.velocity.x = smoothStep(
      displayCar.velocity.x,
      target.car.velocity.x,
      0.12,
      dt
    );
    displayCar.velocity.y = smoothStep(
      displayCar.velocity.y,
      target.car.velocity.y,
      0.12,
      dt
    );
    displayCar.heading = smoothAngle(
      displayCar.heading,
      target.car.heading,
      0.08,
      dt
    );

    displayCamera.x = smoothStep(displayCamera.x, target.camera.x, 0.12, dt);
    displayCamera.y = smoothStep(displayCamera.y, target.camera.y, 0.12, dt);
  };

  const maybeAdjustResolution = (time: number, frameDt: number) => {
    const frameMs = frameDt * 1000;
    frameEmaMs = frameEmaMs * 0.9 + frameMs * 0.1;
    if (time - lastScaleCheck < 500) return;
    lastScaleCheck = time;

    let nextScale = renderScale;
    if (frameEmaMs > 18) {
      nextScale = Math.max(0.6, renderScale - 0.05);
    } else if (frameEmaMs < 14) {
      nextScale = Math.min(settings.maxDpr, renderScale + 0.02);
    }

    if (Math.abs(nextScale - renderScale) >= 0.01) {
      renderScale = nextScale;
      resize();
    }
  };

  const loop = (time: number) => {
    if (!renderer) return;

    const frameDt = Math.min(MAX_FRAME_TIME, (time - lastTime) / 1000);
    lastTime = time;

    if (!worker) {
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= settings.fixedStep && steps < MAX_SIM_STEPS) {
        updateLocal(settings.fixedStep);
        accumulator -= settings.fixedStep;
        steps += 1;
      }
      if (steps === MAX_SIM_STEPS) {
        accumulator = 0;
      }
    }

    maybeAdjustResolution(time, frameDt);

    const renderInterval = 1000 / Math.max(10, settings.renderFps);
    if (time - lastRender >= renderInterval) {
      const snapshot = workerSnapshot;
      if (snapshot) {
        const renderDt = Math.max(0.001, (time - lastRender) / 1000);
        updateDisplayState(snapshot, renderDt);
      } else {
        displayCar.position.x = simState.car.position.x;
        displayCar.position.y = simState.car.position.y;
        displayCar.velocity.x = simState.car.velocity.x;
        displayCar.velocity.y = simState.car.velocity.y;
        displayCar.heading = simState.car.heading;
        displayCamera.x = simState.camera.x;
        displayCamera.y = simState.camera.y;
      }

      renderer.render({
        car: displayCar,
        camera: displayCamera,
        config: trackConfig,
        anchor
      });
      lastRender = time;
    }

    if (onTelemetry && time - lastTelemetry > TELEMETRY_INTERVAL) {
      lastTelemetry = time;
      const telemetry = workerSnapshot?.telemetry ?? getTelemetry(simState);
      onTelemetry(telemetry);
    }

    raf = window.requestAnimationFrame(loop);
  };

  const start = () => {
    if (!renderer || destroyed) return;
    renderer.updateTrack(trackConfig);
    renderer.setQuality(settings.quality);
    resize();
    raf = window.requestAnimationFrame(loop);
  };

  const initRenderer = async () => {
    const createCanvasFallback = () => {
      try {
        return createCanvasRenderer(canvas);
      } catch (error) {
        const freshCanvas = document.createElement("canvas");
        freshCanvas.className = canvas.className;
        freshCanvas.setAttribute("aria-hidden", "true");
        if (canvas.parentElement === container) {
          container.replaceChild(freshCanvas, canvas);
        } else {
          container.appendChild(freshCanvas);
        }
        canvas = freshCanvas;
        return createCanvasRenderer(canvas);
      }
    };

    if (settings.renderer === "canvas2d") {
      return createCanvasFallback();
    }

    try {
      return await createPixiRenderer(canvas, trackConfig);
    } catch (error) {
      return createCanvasFallback();
    }
  };

  void initRenderer().then((nextRenderer) => {
    if (destroyed) {
      nextRenderer.destroy();
      return;
    }
    renderer = nextRenderer;
    start();
  });

  return {
    updateTrack: (config: TrackConfig) => {
      trackConfig = config;
      renderer?.updateTrack(config);
      if (worker) {
        worker.postMessage({ type: "updateTrack", trackConfig: config });
      }
    },
    destroy: () => {
      destroyed = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", resize);
      worker?.terminate();
      renderer?.destroy();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    }
  };
}
