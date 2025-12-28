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
  const length = 40;
  const width = 20;

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(car.heading);

  // Subtle shadow for depth / speed readability.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#020409";
  ctx.beginPath();
  ctx.ellipse(0, length * 0.08, width * 0.75, length * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // RX-7-ish top-down silhouette with smoother curves.
  const noseY = -length * 0.58;
  const tailY = length * 0.58;
  const hoodY = -length * 0.28;
  const roofY = -length * 0.08;
  const rearDeckY = length * 0.22;

  const half = width / 2;
  const flare = half * 1.08;
  const waist = half * 0.72;

  // Wheels (draw first so the body sits on top).
  ctx.save();
  ctx.fillStyle = "#0b0f15";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.lineWidth = 1;
  const wheelW = width * 0.24;
  const wheelH = length * 0.24;
  const wheelX = width * 0.58;
  const frontAxleY = -length * 0.18;
  const rearAxleY = length * 0.22;
  ctx.beginPath();
  roundRectPath(
    ctx,
    -wheelX - wheelW / 2,
    frontAxleY - wheelH / 2,
    wheelW,
    wheelH,
    3
  );
  roundRectPath(
    ctx,
    wheelX - wheelW / 2,
    frontAxleY - wheelH / 2,
    wheelW,
    wheelH,
    3
  );
  roundRectPath(
    ctx,
    -wheelX - wheelW / 2,
    rearAxleY - wheelH / 2,
    wheelW,
    wheelH,
    3
  );
  roundRectPath(
    ctx,
    wheelX - wheelW / 2,
    rearAxleY - wheelH / 2,
    wheelW,
    wheelH,
    3
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Body fill.
  ctx.fillStyle = "#d0242b"; // red
  ctx.strokeStyle = "rgba(8, 12, 18, 0.85)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  // Start at front center, curve around the nose and right fender.
  ctx.moveTo(0, noseY);
  ctx.bezierCurveTo(flare * 0.55, noseY, flare, hoodY * 1.05, flare, hoodY);
  // Down the right side into the cabin waist.
  ctx.bezierCurveTo(flare, roofY, waist, rearDeckY, waist, rearDeckY + length * 0.08);
  // Rear quarter bulge to tail.
  ctx.bezierCurveTo(waist, tailY * 0.88, flare * 0.92, tailY, 0, tailY);
  // Mirror to left side.
  ctx.bezierCurveTo(-flare * 0.92, tailY, -waist, tailY * 0.88, -waist, rearDeckY + length * 0.08);
  ctx.bezierCurveTo(-waist, rearDeckY, -flare, roofY, -flare, hoodY);
  ctx.bezierCurveTo(-flare, hoodY * 1.05, -flare * 0.55, noseY, 0, noseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hood highlight.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, noseY + length * 0.02);
  ctx.bezierCurveTo(
    half * 0.3,
    noseY + length * 0.02,
    half * 0.42,
    hoodY,
    0,
    hoodY + length * 0.02
  );
  ctx.bezierCurveTo(
    -half * 0.42,
    hoodY,
    -half * 0.3,
    noseY + length * 0.02,
    0,
    noseY + length * 0.02
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Front bumper / grille.
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 18, 0.78)";
  const bumperY = noseY + length * 0.12;
  const bumperW = width * 0.92;
  const bumperH = length * 0.11;
  ctx.beginPath();
  roundRectPath(ctx, -bumperW / 2, bumperY, bumperW, bumperH, 6);
  ctx.fill();
  ctx.restore();

  // Headlights (front) — make the front obvious.
  ctx.save();
  ctx.shadowColor = "rgba(248, 250, 252, 0.65)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
  ctx.strokeStyle = "rgba(15, 23, 32, 0.35)";
  ctx.lineWidth = 1.2;
  const headlightY = noseY + length * 0.08;
  const headlightW = width * 0.22;
  const headlightH = length * 0.1;
  const headlightInset = width * 0.28;
  ctx.beginPath();
  roundRectPath(
    ctx,
    -headlightInset - headlightW / 2,
    headlightY,
    headlightW,
    headlightH,
    4
  );
  roundRectPath(
    ctx,
    headlightInset - headlightW / 2,
    headlightY,
    headlightW,
    headlightH,
    4
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Windows (tinted).
  ctx.save();
  ctx.fillStyle = "rgba(5, 9, 14, 0.72)";
  ctx.beginPath();
  ctx.moveTo(0, roofY - length * 0.18);
  ctx.bezierCurveTo(
    half * 0.62,
    roofY - length * 0.12,
    half * 0.58,
    rearDeckY - length * 0.05,
    0,
    rearDeckY - length * 0.02
  );
  ctx.bezierCurveTo(
    -half * 0.58,
    rearDeckY - length * 0.05,
    -half * 0.62,
    roofY - length * 0.12,
    0,
    roofY - length * 0.18
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Rear wing / spoiler.
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 18, 0.85)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 1;
  const wingY = tailY - length * 0.08;
  ctx.beginPath();
  roundRectPath(ctx, -width * 0.42, wingY, width * 0.84, length * 0.06, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Taillights.
  ctx.save();
  ctx.fillStyle = "rgba(255, 54, 54, 0.78)";
  const tlY = tailY - length * 0.18;
  ctx.beginPath();
  roundRectPath(ctx, -width * 0.42, tlY, width * 0.22, length * 0.08, 3);
  roundRectPath(ctx, width * 0.2, tlY, width * 0.22, length * 0.08, 3);
  ctx.fill();
  ctx.restore();

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

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
