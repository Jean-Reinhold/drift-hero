import * as PIXI from "pixi.js";
import type { CarState, Vec2 } from "./physics";
import type { TrackConfig } from "./track";
import { createAsphaltPattern, renderFrame } from "./render";
import { PixiRenderer } from "./pixi-render";

export type RenderInputs = {
  car: CarState;
  camera: Vec2;
  config: TrackConfig;
  anchor: Vec2;
};

export type RenderQuality = {
  environment: "none" | "low" | "high";
};

export type Renderer = {
  resize: (clientWidth: number, clientHeight: number, dpr: number) => void;
  render: (input: RenderInputs) => void;
  updateTrack: (config: TrackConfig) => void;
  setQuality: (quality: RenderQuality) => void;
  destroy: () => void;
};

export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  let asphalt = createAsphaltPattern(ctx);

  return {
    resize: (clientWidth, clientHeight, dpr) => {
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      asphalt = createAsphaltPattern(ctx);
    },
    render: ({ car, camera, config, anchor }) => {
      renderFrame({
        ctx,
        canvas,
        config,
        car,
        camera,
        anchor,
        asphalt
      });
    },
    updateTrack: () => {},
    setQuality: () => {},
    destroy: () => {}
  };
}

export async function createPixiRenderer(
  canvas: HTMLCanvasElement,
  config: TrackConfig
): Promise<Renderer> {
  if (!PIXI.isWebGLSupported()) {
    throw new Error("WebGL not supported");
  }

  const app = new PIXI.Application();
  await app.init({
    canvas,
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    autoStart: false,
    preference: "webgl",
    powerPreference: "high-performance"
  });
  app.renderer.roundPixels = true;

  const pixiRenderer = new PixiRenderer(app, config);

  return {
    resize: (clientWidth, clientHeight, dpr) => {
      app.renderer.resolution = dpr;
      app.renderer.resize(clientWidth, clientHeight);
    },
    render: (input) => {
      pixiRenderer.render(input);
    },
    updateTrack: (nextConfig) => {
      pixiRenderer.updateTrack(nextConfig);
    },
    setQuality: (quality) => {
      pixiRenderer.setQuality(quality);
    },
    destroy: () => {
      pixiRenderer.destroy();
      app.destroy();
    }
  };
}
