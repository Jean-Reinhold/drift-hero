import * as PIXI from "pixi.js";
import { CarState, Vec2 } from "./physics";
import { TrackConfig, sampleTrack } from "./track";

export type PixiRenderOptions = {
  config: TrackConfig;
  car: CarState;
  camera: Vec2;
  anchor: Vec2;
};

type RenderQuality = {
  environment: "none" | "low" | "high";
};

type EnvItem = {
  worldX: number;
  worldY: number;
  size: number;
};

// Pixi v8 `GlProgram` injects `#version 300 es` automatically, so shaders must use GLSL 300 syntax.
const ROAD_VERTEX_SHADER = `
    precision highp float;

    in vec2 aPosition;
    out vec2 vTextureCoord;

    void main() {
        vTextureCoord = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const ROAD_FRAGMENT_SHADER = `
    precision highp float;

    in vec2 vTextureCoord;
    out vec4 finalColor;

    uniform vec2 uResolution;
    uniform vec2 uCamera;
    uniform vec2 uAnchor;
    uniform float uTrackWidth;
    uniform float uBands[12];
    uniform float uNumBands;

    void main() {
        vec2 screenPos = vTextureCoord * uResolution;
        float worldX = screenPos.x - uAnchor.x + uCamera.x;
        float worldY = uAnchor.y - screenPos.y + uCamera.y;

        float centerX = 0.0;

        // Manual unrolling for maximum compatibility
        if (uNumBands > 0.5) centerX += uBands[0] * sin(worldY * uBands[1] + uBands[2]);
        if (uNumBands > 1.5) centerX += uBands[3] * sin(worldY * uBands[4] + uBands[5]);
        if (uNumBands > 2.5) centerX += uBands[6] * sin(worldY * uBands[7] + uBands[8]);
        if (uNumBands > 3.5) centerX += uBands[9] * sin(worldY * uBands[10] + uBands[11]);

        float distToCenter = abs(worldX - centerX);

        // Midnight Tokyo gradient
        float t = screenPos.y / uResolution.y;
        vec3 bgColor = mix(vec3(0.04, 0.04, 0.12), vec3(0.01, 0.01, 0.03), t);

        vec4 color = vec4(bgColor, 1.0);

        if (distToCenter < uTrackWidth * 0.5) {
            // Asphalt
            color = vec4(0.06, 0.08, 0.11, 1.0);

            // Edge stroke
            if (distToCenter > uTrackWidth * 0.5 - 4.0) {
                color = vec4(0.17, 0.21, 0.25, 1.0);
            }

            // Center dash line
            if (distToCenter < 1.0) {
                float dash = step(0.5, fract(worldY * 0.02));
                color = mix(color, vec4(1.0, 0.97, 0.87, 0.12), dash);
            }
        }

        // Vignette
        float d = distance(vTextureCoord, vec2(0.5, 0.7));
        color.rgb *= smoothstep(0.8, 0.3, d);

        finalColor = color;
    }
`;

export class PixiRenderer {
  private app: PIXI.Application;
  private roadMesh: PIXI.Mesh<PIXI.MeshGeometry, PIXI.Shader>;
  private carContainer: PIXI.Container;
  private buildingsContainer: PIXI.Container;
  private lightsContainer: PIXI.Container;
  private uniforms: Record<string, any>;
  private config: TrackConfig;
  private quality: RenderQuality = { environment: "high" };

  private buildingSprites: PIXI.Sprite[] = [];
  private lightSprites: PIXI.Sprite[] = [];
  private envBuildings: EnvItem[] = [];
  private envLights: EnvItem[] = [];
  private segmentCache = new Map<number, number>();
  private envNeedsRebuild = true;
  private lastEnv = {
    firstSeg: 0,
    lastSeg: -1,
    spacing: 0,
    lightEvery: 0,
    buildingSize: 0,
    lightSize: 0,
    width: 0,
    seed: 0
  };
  private lightTexture: PIXI.Texture;

  constructor(app: PIXI.Application, config: TrackConfig) {
    this.app = app;
    this.config = config;

    // Road Shader
    const geometry = new PIXI.MeshGeometry({
      positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3])
    });

    const bandsData = new Float32Array(12);
    config.bands.forEach((b, i) => {
        bandsData[i * 3] = b.amplitude;
        bandsData[i * 3 + 1] = b.frequency;
        bandsData[i * 3 + 2] = b.phase;
    });

    const shader = new PIXI.Shader({
      glProgram: PIXI.GlProgram.from({
        name: "drift-road",
        vertex: ROAD_VERTEX_SHADER,
        fragment: ROAD_FRAGMENT_SHADER
      }),
      resources: {
        uResolution: new Float32Array([app.screen.width, app.screen.height]),
        uCamera: new Float32Array([0, 0]),
        uAnchor: new Float32Array([0, 0]),
        uTrackWidth: config.width,
        uBands: bandsData,
        uNumBands: config.bands.length
      }
    });

    this.roadMesh = new PIXI.Mesh<PIXI.MeshGeometry, PIXI.Shader>({
      geometry,
      shader
    });
    this.uniforms = this.roadMesh.shader.resources as Record<string, any>;
    this.app.stage.addChild(this.roadMesh);

    this.buildingsContainer = new PIXI.Container();
    this.app.stage.addChild(this.buildingsContainer);

    this.lightsContainer = new PIXI.Container();
    this.app.stage.addChild(this.lightsContainer);

    this.carContainer = new PIXI.Container();
    const carGraphics = new PIXI.Graphics();
    this.drawCarShape(carGraphics);
    this.carContainer.addChild(carGraphics);
    this.app.stage.addChild(this.carContainer);

    this.lightTexture = this.createLightTexture();
  }

  private createLightTexture(): PIXI.Texture {
    const g = new PIXI.Graphics();
    g.fill({ color: 0xffd278, alpha: 0.9 }).circle(0, 0, 12);
    const texture = this.app.renderer.generateTexture(g);
    g.destroy();
    return texture;
  }

  private drawCarShape(g: PIXI.Graphics) {
    const length = 40;
    const width = 20;
    
    g.clear()
        .fill({ color: 0xd0242b })
        .stroke({ color: 0x080c12, width: 2 })
        .roundRect(-width / 2, -length / 2, width, length, 4);
    
    // Headlights
    g.fill({ color: 0xf8fafa })
        .rect(-width * 0.4, -length * 0.45, 4, 2)
        .rect(width * 0.4 - 4, -length * 0.45, 4, 2);
  }

  private ensureSprites(buildings: number, lights: number) {
    while (this.buildingSprites.length < buildings) {
      const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.tint = 0x070a12;
      sprite.alpha = 0.75;
      this.buildingsContainer.addChild(sprite);
      this.buildingSprites.push(sprite);
    }

    while (this.lightSprites.length < lights) {
      const sprite = new PIXI.Sprite(this.lightTexture);
      sprite.anchor.set(0.5);
      sprite.alpha = 0.28;
      sprite.blendMode = PIXI.BLEND_MODES.SCREEN;
      this.lightsContainer.addChild(sprite);
      this.lightSprites.push(sprite);
    }
  }

  private getCenterX(segIndex: number, spacing: number, config: TrackConfig) {
    let cached = this.segmentCache.get(segIndex);
    if (cached === undefined) {
      cached = sampleTrack(config, segIndex * spacing).centerX;
      this.segmentCache.set(segIndex, cached);
      if (this.segmentCache.size > 2000) {
        this.segmentCache.clear();
      }
    }
    return cached;
  }

  private rebuildEnvironment(
    config: TrackConfig,
    firstSeg: number,
    lastSeg: number,
    spacing: number,
    lightEvery: number,
    buildingSize: number,
    lightSize: number
  ) {
    if (spacing !== this.lastEnv.spacing) {
      this.segmentCache.clear();
    }
    this.envBuildings = [];
    this.envLights = [];

    for (let seg = firstSeg; seg <= lastSeg; seg++) {
      const y = seg * spacing;
      const centerX = this.getCenterX(seg, spacing, config);
      this.envBuildings.push({
        worldX: centerX - config.width * 0.8,
        worldY: y,
        size: buildingSize
      });
      this.envBuildings.push({
        worldX: centerX + config.width * 0.8,
        worldY: y,
        size: buildingSize
      });

      if (seg % lightEvery === 0) {
        this.envLights.push({
          worldX: centerX - config.width * 0.6,
          worldY: y,
          size: lightSize
        });
      }
    }

    this.ensureSprites(this.envBuildings.length, this.envLights.length);
    for (let i = 0; i < this.envBuildings.length; i++) {
      const sprite = this.buildingSprites[i];
      sprite.width = this.envBuildings[i].size;
      sprite.height = this.envBuildings[i].size;
      sprite.visible = true;
    }
    for (let i = this.envBuildings.length; i < this.buildingSprites.length; i++) {
      this.buildingSprites[i].visible = false;
    }

    for (let i = 0; i < this.envLights.length; i++) {
      const sprite = this.lightSprites[i];
      sprite.width = this.envLights[i].size;
      sprite.height = this.envLights[i].size;
      sprite.visible = true;
    }
    for (let i = this.envLights.length; i < this.lightSprites.length; i++) {
      this.lightSprites[i].visible = false;
    }
    this.lastEnv = {
      firstSeg,
      lastSeg,
      spacing,
      lightEvery,
      buildingSize,
      lightSize,
      width: config.width,
      seed: config.seed
    };
    this.envNeedsRebuild = false;
  }

  setQuality(quality: RenderQuality) {
    this.quality = quality;
    this.envNeedsRebuild = true;
  }

  updateTrack(config: TrackConfig) {
    this.config = config;
    const bands = this.uniforms.uBands as Float32Array;
    bands.fill(0);
    config.bands.forEach((b, i) => {
      bands[i * 3] = b.amplitude;
      bands[i * 3 + 1] = b.frequency;
      bands[i * 3 + 2] = b.phase;
    });
    this.uniforms.uTrackWidth = config.width;
    this.uniforms.uNumBands = config.bands.length;
    this.segmentCache.clear();
    this.envNeedsRebuild = true;
  }

  render(options: PixiRenderOptions) {
    const { car, camera, anchor } = options;
    const config = options.config ?? this.config;
    this.config = config;

    const uniforms = this.uniforms;
    uniforms.uCamera[0] = camera.x;
    uniforms.uCamera[1] = camera.y;
    uniforms.uAnchor[0] = anchor.x;
    uniforms.uAnchor[1] = anchor.y;
    uniforms.uResolution[0] = this.app.screen.width;
    uniforms.uResolution[1] = this.app.screen.height;

    this.carContainer.x = anchor.x + (car.position.x - camera.x);
    this.carContainer.y = anchor.y - (car.position.y - camera.y);
    this.carContainer.rotation = car.heading;

    if (this.quality.environment === "none") {
      this.buildingsContainer.visible = false;
      this.lightsContainer.visible = false;
      this.app.render();
      return;
    }
    this.buildingsContainer.visible = true;
    this.lightsContainer.visible = true;

    const height = this.app.screen.height;
    const startY = camera.y - height * 0.55;
    const endY = camera.y + height * 1.35;

    // Simplified environment rendering
    const spacing = this.quality.environment === "high" ? 200 : 320;
    const firstSeg = Math.floor(startY / spacing);
    const lastSeg = Math.floor(endY / spacing);
    const lightEvery = this.quality.environment === "high" ? 2 : 5;
    const buildingSize = this.quality.environment === "high" ? 80 : 62;
    const lightSize = this.quality.environment === "high" ? 28 : 22;

    const needsRebuild =
      this.envNeedsRebuild ||
      firstSeg !== this.lastEnv.firstSeg ||
      lastSeg !== this.lastEnv.lastSeg ||
      spacing !== this.lastEnv.spacing ||
      lightEvery !== this.lastEnv.lightEvery ||
      buildingSize !== this.lastEnv.buildingSize ||
      lightSize !== this.lastEnv.lightSize ||
      config.width !== this.lastEnv.width ||
      config.seed !== this.lastEnv.seed;

    if (needsRebuild) {
      this.rebuildEnvironment(
        config,
        firstSeg,
        lastSeg,
        spacing,
        lightEvery,
        buildingSize,
        lightSize
      );
    }

    for (let i = 0; i < this.envBuildings.length; i++) {
      const item = this.envBuildings[i];
      const sprite = this.buildingSprites[i];
      sprite.x = anchor.x + (item.worldX - camera.x);
      sprite.y = anchor.y - (item.worldY - camera.y);
    }

    for (let i = 0; i < this.envLights.length; i++) {
      const item = this.envLights[i];
      const sprite = this.lightSprites[i];
      sprite.x = anchor.x + (item.worldX - camera.x);
      sprite.y = anchor.y - (item.worldY - camera.y);
    }

    this.app.render();
  }

  destroy() {
    this.lightTexture.destroy();
    this.roadMesh.destroy({ children: true });
    this.carContainer.destroy({ children: true });
    this.buildingsContainer.destroy({ children: true });
    this.lightsContainer.destroy({ children: true });
  }
}
