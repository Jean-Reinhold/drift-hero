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

  // Darker asphalt for night driving.
  tctx.fillStyle = "#0f141c";
  tctx.fillRect(0, 0, tile.width, tile.height);

  for (let i = 0; i < 500; i += 1) {
    tctx.fillStyle = `rgba(248, 250, 252, ${Math.random() * 0.06})`;
    tctx.fillRect(
      Math.random() * tile.width,
      Math.random() * tile.height,
      1 + Math.random() * 1.5,
      1 + Math.random() * 1.5
    );
    tctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.18})`;
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
  drawCityEnvironment(ctx, width, height, config, camera, anchor, "backdrop");
  drawTrack(ctx, height, config, camera, anchor, asphalt);
  drawCityEnvironment(ctx, width, height, config, camera, anchor, "lights");
  drawCar(ctx, car, camera, anchor);
  drawVignette(ctx, width, height);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  // Midnight Tokyo: deep navy with a subtle purple/blue city glow.
  gradient.addColorStop(0, "#0a0b1f");
  gradient.addColorStop(0.55, "#050716");
  gradient.addColorStop(1, "#020208");
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

  if (asphalt) {
    const pTx = anchor.x - camera.x;
    const pTy = anchor.y + camera.y;
    asphalt.setTransform(new DOMMatrix().translate(pTx, pTy));
  }

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Draw edge strokes first, then paint the asphalt fill over the inside portion.
  // This hides self-intersection artifacts on tight turns while keeping the outer edge visible.
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#2c3541";
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
  ctx.fillStyle = asphalt ?? "#0f141b";
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 247, 223, 0.12)";
  const dashLength = 18;
  const dashGap = 18;
  ctx.setLineDash([dashLength, dashGap]);
  ctx.lineDashOffset = -startY;
  ctx.beginPath();
  drawSmoothLine(ctx, centerPoints, true);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();
}

type CityLayer = "backdrop" | "lights";

function drawCityEnvironment(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: TrackConfig,
  camera: Vec2,
  anchor: Vec2,
  layer: CityLayer
): void {
  const viewBack = height * 0.55;
  const viewAhead = height * 1.35;
  const startY = camera.y - viewBack;
  const endY = camera.y + viewAhead;
  const range = Math.max(1, endY - startY);

  if (layer === "backdrop") {
    // Building density tuning: fewer segments + larger setbacks so the road feels more open.
    const spacing = 180;
    const firstSeg = Math.floor(startY / spacing) - 2;
    const lastSeg = Math.floor(endY / spacing) + 2;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let seg = firstSeg; seg <= lastSeg; seg += 1) {
      const y = seg * spacing;
      const sample = sampleTrack(config, y);
      const halfWidth = config.width / 2;

      // Tangent follows the road direction (in world space).
      const tangent = { x: -sample.normal.y, y: sample.normal.x };

      for (const sideSign of [1, -1] as const) {
        const baseSeed =
          (config.seed | 0) ^
          Math.imul(seg | 0, 374761393) ^
          (sideSign === 1 ? 0x9e3779b9 : 0x85ebca6b);

        // Leave occasional gaps so it feels like alleys / open lots.
        if (hash01(baseSeed) < 0.28) continue;

        const clusterCount = 1 + Math.floor(hash01(baseSeed ^ 0x27d4eb2d) * 2);

        for (let i = 0; i < clusterCount; i += 1) {
          const seed = baseSeed ^ Math.imul(i + 1, 0x517cc1b7);

          const buildingWidth = 110 + hash01(seed ^ 0x68bc21eb) * 200; // along tangent
          const buildingDepth = 70 + hash01(seed ^ 0x02e5be93) * 120; // outward normal
          const setback = 70 + hash01(seed ^ 0x165667b1) * 140;
          const tangentShift = (hash01(seed ^ 0x1b873593) - 0.5) * 70;

          // Road edge at this Y, then shift outward for building placement.
          const edgeWorld = {
            x: sample.centerX + sample.normal.x * halfWidth * sideSign,
            y: y + sample.normal.y * halfWidth * sideSign
          };

          const outward = { x: sample.normal.x * sideSign, y: sample.normal.y * sideSign };
          const centerWorld = {
            x:
              edgeWorld.x +
              outward.x * (setback + buildingDepth / 2) +
              tangent.x * tangentShift,
            y:
              edgeWorld.y +
              outward.y * (setback + buildingDepth / 2) +
              tangent.y * tangentShift
          };

          const center = worldToScreen(centerWorld, camera, anchor);
          const depthT = (y - startY) / range;
          const roadAngle = Math.atan2(-tangent.y, tangent.x);

          // Fade as objects get far ahead, and also fade very close to the bottom edge.
          const farFade = 0.18 + (1 - clamp01(depthT)) * 0.34;
          const bottomFade = clamp01(1 - Math.max(0, center.y - height * 0.88) / (height * 0.22));
          const alpha = farFade * bottomFade;

          ctx.save();
          ctx.translate(center.x, center.y);
          ctx.rotate(roadAngle);

          // Main mass (silhouette).
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#070a12";
          ctx.strokeStyle = "rgba(180, 200, 255, 0.08)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          roundRectPath(
            ctx,
            -buildingWidth / 2,
            -buildingDepth / 2,
            buildingWidth,
            buildingDepth,
            10
          );
          ctx.fill();
          ctx.stroke();

          // Sparse neon/window speckles for 90s Tokyo vibe.
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = alpha * 0.65;
          const cols = Math.max(2, Math.floor(buildingWidth / 34));
          const rows = Math.max(2, Math.floor(buildingDepth / 26));
          const wPadX = buildingWidth * 0.08;
          const wPadY = buildingDepth * 0.1;
          const cellW = (buildingWidth - wPadX * 2) / cols;
          const cellH = (buildingDepth - wPadY * 2) / rows;

          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const wSeed = seed ^ Math.imul(r + 1, 0x51d7348d) ^ Math.imul(c + 1, 0x85ebca6b);
              if (hash01(wSeed) < 0.62) continue;

              const tintPick = hash01(wSeed ^ 0x9e3779b9);
              const color =
                tintPick < 0.45
                  ? "rgba(56, 189, 248, 0.35)" // cyan
                  : tintPick < 0.8
                    ? "rgba(236, 72, 153, 0.28)" // pink
                    : "rgba(255, 204, 128, 0.22)"; // warm

              ctx.fillStyle = color;
              const wx = -buildingWidth / 2 + wPadX + c * cellW + cellW * 0.3;
              const wy = -buildingDepth / 2 + wPadY + r * cellH + cellH * 0.32;
              ctx.fillRect(wx, wy, Math.max(2, cellW * 0.28), Math.max(2, cellH * 0.22));
            }
          }

          // Occasional neon sign closer to the road side.
          if (hash01(seed ^ 0x1337) > 0.72) {
            const signColor =
              hash01(seed ^ 0x7331) > 0.5
                ? "rgba(34, 211, 238, 0.45)"
                : "rgba(244, 114, 182, 0.40)";
            ctx.globalAlpha = alpha * 0.9;
            ctx.shadowBlur = 18;
            ctx.shadowColor = signColor;
            ctx.fillStyle = signColor;
            const signW = Math.min(46, buildingWidth * 0.22);
            const signH = Math.min(18, buildingDepth * 0.22);
            const signX = -signW / 2 + (hash01(seed ^ 0x5bd1e995) - 0.5) * 30;
            const signY = -buildingDepth / 2 + 10;
            ctx.fillRect(signX, signY, signW, signH);
            ctx.shadowBlur = 0;
          }

          ctx.restore();
        }
      }
    }

    ctx.restore();
    return;
  }

  // Foreground lights pass (drawn after the asphalt so light can spill onto the road).
  const lightSpacing = 260;
  const firstLightSeg = Math.floor(startY / lightSpacing) - 2;
  const lastLightSeg = Math.floor(endY / lightSpacing) + 2;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "screen";

  for (let seg = firstLightSeg; seg <= lastLightSeg; seg += 1) {
    const y = seg * lightSpacing;
    const sample = sampleTrack(config, y);
    const halfWidth = config.width / 2;
    const tangent = { x: -sample.normal.y, y: sample.normal.x };
    const roadAngle = Math.atan2(-tangent.y, tangent.x);
    const depthT = (y - startY) / range;
    const depthFade = 0.45 + (1 - clamp01(depthT)) * 0.55;

    for (const sideSign of [1, -1] as const) {
      const baseSeed =
        (config.seed | 0) ^
        Math.imul(seg | 0, 0x27d4eb2d) ^
        (sideSign === 1 ? 0x165667b1 : 0x68bc21eb);

      // Randomly skip some poles so it doesn't look like a perfect grid.
      if (hash01(baseSeed) < 0.18) continue;

      const edgeWorld = {
        x: sample.centerX + sample.normal.x * halfWidth * sideSign,
        y: y + sample.normal.y * halfWidth * sideSign
      };

      const outward = { x: sample.normal.x * sideSign, y: sample.normal.y * sideSign };
      const offsetOut = 22 + hash01(baseSeed ^ 0x51d7348d) * 16;
      const armIn = 10 + hash01(baseSeed ^ 0x85ebca6b) * 8;
      const armForward = (hash01(baseSeed ^ 0x9e3779b9) - 0.5) * 22;

      const baseWorld = {
        x: edgeWorld.x + outward.x * offsetOut,
        y: edgeWorld.y + outward.y * offsetOut
      };
      const lampWorld = {
        x: baseWorld.x - outward.x * armIn + tangent.x * armForward,
        y: baseWorld.y - outward.y * armIn + tangent.y * armForward
      };

      const base = worldToScreen(baseWorld, camera, anchor);
      const lamp = worldToScreen(lampWorld, camera, anchor);

      const tint = hash01(baseSeed ^ 0x1337);
      const color =
        tint < 0.5
          ? { r: 255, g: 210, b: 120 } // warm sodium
          : tint < 0.85
            ? { r: 120, g: 200, b: 255 } // cool LED
            : { r: 244, g: 114, b: 182 }; // neon pink

      const glowR = (110 + (1 - clamp01(depthT)) * 90) * (0.85 + depthFade * 0.15);
      const glowAlpha = 0.16 * depthFade;

      // Soft radial glow.
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, glowR);
      glow.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.42 * glowAlpha})`);
      glow.addColorStop(0.35, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.22 * glowAlpha})`);
      glow.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(lamp.x - glowR, lamp.y - glowR, glowR * 2, glowR * 2);

      // Elongated light spill (reads as illumination on the road surface).
      ctx.save();
      ctx.translate(lamp.x, lamp.y);
      ctx.rotate(roadAngle);
      ctx.globalAlpha = 0.9 * glowAlpha;
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.08)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, glowR * 0.82, glowR * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Pole + arm.
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.35 * depthFade;
      ctx.strokeStyle = "rgba(120, 140, 160, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(lamp.x, lamp.y);
      ctx.stroke();
      ctx.restore();

      // Lamp head.
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.9 * depthFade;
      ctx.shadowBlur = 14;
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.55)`;
      ctx.fillStyle = `rgba(248, 250, 252, 0.9)`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hash01(n: number): number {
  return hash32(n) / 4294967296;
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
