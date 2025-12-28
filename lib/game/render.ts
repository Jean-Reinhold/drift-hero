import { CarState, Vec2 } from "./physics";
import { TrackConfig, sampleTrack } from "./track";

export type RenderOptions = {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  config: TrackConfig;
  car: CarState;
  camera: Vec2;
  anchor: Vec2;
  asphalt: CanvasPattern | null;
};

type ScreenPoint = { x: number; y: number };

export function createAsphaltPattern(
  ctx: CanvasRenderingContext2D
): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 160;
  tile.height = 160;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  tctx.fillStyle = "#1b222c";
  tctx.fillRect(0, 0, tile.width, tile.height);

  for (let i = 0; i < 500; i += 1) {
    tctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.08})`;
    tctx.fillRect(
      Math.random() * tile.width,
      Math.random() * tile.height,
      1 + Math.random() * 1.5,
      1 + Math.random() * 1.5
    );
    tctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.12})`;
    tctx.fillRect(
      Math.random() * tile.width,
      Math.random() * tile.height,
      1 + Math.random() * 2,
      1 + Math.random() * 2
    );
  }

  return ctx.createPattern(tile, "repeat");
}

export function renderFrame({
  ctx,
  canvas,
  config,
  car,
  camera,
  anchor,
  asphalt
}: RenderOptions): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  ctx.clearRect(0, 0, width, height);

  drawBackground(ctx, width, height);
  drawTrack(ctx, height, config, camera, anchor, asphalt);
  drawCar(ctx, car, camera, anchor);
  drawVignette(ctx, width, height);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0b0f15");
  gradient.addColorStop(1, "#05070b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  height: number,
  config: TrackConfig,
  camera: Vec2,
  anchor: Vec2,
  asphalt: CanvasPattern | null
): void {
  const viewBack = height * 0.55;
  const viewAhead = height * 1.35;
  const startY = camera.y - viewBack;
  const endY = camera.y + viewAhead;
  const step = 10;

  const leftPoints: ScreenPoint[] = [];
  const rightPoints: ScreenPoint[] = [];
  const centerPoints: ScreenPoint[] = [];

  for (let y = startY; y <= endY; y += step) {
    const sample = sampleTrack(config, y);
    const halfWidth = config.width / 2;

    const leftWorld = {
      x: sample.centerX + sample.normal.x * halfWidth,
      y: y + sample.normal.y * halfWidth
    };
    const rightWorld = {
      x: sample.centerX - sample.normal.x * halfWidth,
      y: y - sample.normal.y * halfWidth
    };

    leftPoints.push(worldToScreen(leftWorld, camera, anchor));
    rightPoints.push(worldToScreen(rightWorld, camera, anchor));
    centerPoints.push(worldToScreen({ x: sample.centerX, y }, camera, anchor));
  }

  if (leftPoints.length === 0) return;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Draw edge strokes first, then paint the asphalt fill over the inside portion.
  // This hides self-intersection artifacts on tight turns while keeping the outer edge visible.
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#3f4a57";
  ctx.beginPath();
  drawSmoothLine(ctx, leftPoints, true);
  ctx.stroke();

  ctx.beginPath();
  drawSmoothLine(ctx, rightPoints, true);
  ctx.stroke();

  ctx.beginPath();
  drawSmoothLine(ctx, leftPoints, true);
  drawSmoothLine(ctx, [...rightPoints].reverse(), false);
  ctx.closePath();
  ctx.fillStyle = asphalt ?? "#1a1f27";
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(248, 250, 252, 0.15)";
  const dashLength = 18;
  const dashGap = 18;
  const dashCycle = dashLength + dashGap;
  // Keep the centerline dashes anchored to world Y instead of the camera.
  const dashOffset = ((startY % dashCycle) + dashCycle) % dashCycle;
  ctx.setLineDash([dashLength, dashGap]);
  ctx.lineDashOffset = dashOffset;
  ctx.beginPath();
  drawSmoothLine(ctx, centerPoints, true);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: CarState,
  camera: Vec2,
  anchor: Vec2
): void {
  const screen = worldToScreen(car.position, camera, anchor);
  const length = 34;
  const width = 18;

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(car.heading);

  ctx.fillStyle = "#f8b44b";
  ctx.strokeStyle = "rgba(15, 23, 32, 0.8)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, -length * 0.6);
  ctx.lineTo(width * 0.6, length * 0.4);
  ctx.lineTo(0, length * 0.6);
  ctx.lineTo(-width * 0.6, length * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(15, 23, 32, 0.7)";
  ctx.fillRect(-width * 0.25, -length * 0.15, width * 0.5, length * 0.4);

  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height * 0.7,
    width * 0.2,
    width / 2,
    height * 0.6,
    width * 0.75
  );
  gradient.addColorStop(0, "rgba(5, 7, 11, 0)");
  gradient.addColorStop(1, "rgba(3, 5, 8, 0.7)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function worldToScreen(
  world: Vec2,
  camera: Vec2,
  anchor: Vec2
): ScreenPoint {
  return {
    x: anchor.x + (world.x - camera.x),
    y: anchor.y - (world.y - camera.y)
  };
}

function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  points: ScreenPoint[],
  moveTo: boolean
): void {
  if (points.length === 0) return;
  if (moveTo) {
    ctx.moveTo(points[0].x, points[0].y);
  } else {
    ctx.lineTo(points[0].x, points[0].y);
  }

  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}
