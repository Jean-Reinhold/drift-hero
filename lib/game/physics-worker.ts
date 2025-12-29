/// <reference lib="webworker" />

import {
  createSimulationState,
  defaultTuning,
  getTelemetry,
  stepSimulation,
  type SimulationState,
  type Telemetry
} from "./simulation";
import type { CarInput, CarTuning, CarState, Vec2 } from "./physics";
import type { TrackConfig } from "./track";

type SimulationSnapshot = {
  car: CarState;
  camera: Vec2;
  telemetry: Telemetry;
};

type WorkerMessageIn =
  | { type: "init"; trackConfig: TrackConfig; tuning?: CarTuning }
  | { type: "input"; input: CarInput }
  | { type: "updateTrack"; trackConfig: TrackConfig }
  | { type: "destroy" };

type WorkerMessageOut = {
  type: "state";
  snapshot: SimulationSnapshot;
};

const FIXED_DT = 1 / 60;
const POST_INTERVAL_MS = 1000 / 60;

let state: SimulationState | null = null;
let trackConfig: TrackConfig | null = null;
let input: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false
};
let tuning: CarTuning = defaultTuning;
let intervalId: number | null = null;
let lastPost = 0;

const postSnapshot = () => {
  if (!state) return;
  const snapshot: SimulationSnapshot = {
    car: {
      position: { ...state.car.position },
      velocity: { ...state.car.velocity },
      heading: state.car.heading
    },
    camera: { ...state.camera },
    telemetry: getTelemetry(state)
  };
  postMessage({ type: "state", snapshot } satisfies WorkerMessageOut);
};

const tick = () => {
  if (!state || !trackConfig) return;
  stepSimulation(state, input, FIXED_DT, trackConfig, tuning);
  const now = performance.now();
  if (now - lastPost >= POST_INTERVAL_MS) {
    lastPost = now;
    postSnapshot();
  }
};

const startLoop = () => {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
  intervalId = self.setInterval(tick, FIXED_DT * 1000);
};

const stopLoop = () => {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
};

self.onmessage = (event: MessageEvent<WorkerMessageIn>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      trackConfig = message.trackConfig;
      tuning = message.tuning ?? defaultTuning;
      state = createSimulationState(trackConfig);
      lastPost = 0;
      postSnapshot();
      startLoop();
      break;
    case "input":
      input = message.input;
      break;
    case "updateTrack":
      trackConfig = message.trackConfig;
      break;
    case "destroy":
      stopLoop();
      self.close();
      break;
    default:
      break;
  }
};
