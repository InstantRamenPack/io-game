import {
  Container,
  Graphics,
  Sprite,
  Texture,
  type Application,
} from "pixi.js";
import type {
  LightsOutVisibilityContext,
  VisibilityBlockerShape,
} from "@client/render/renderTypes.ts";

type ScreenPoint = { x: number; y: number };
type WorldPoint = { x: number; y: number };
type WorldToScreen = (
  app: Application,
  worldX: number,
  worldY: number,
) => ScreenPoint | null;

const MIN_DISTANCE_EPSILON = 1e-6;
const WORLD_SHADOW_EXTENSION = 20_000;
const LIGHTS_OUT_FADE_START_RADIUS = 480;
const LIGHTS_OUT_FADE_END_RADIUS = 600;
const LIGHTS_OUT_FALLOFF_TEXTURE_SIZE = 512;
const DARKNESS_TEXTURE_RADIUS_BUCKET = 4;
const DARKNESS_OVERLAY_COLOR = 0x000000;

export class PixiLightsOutOverlay {
  public readonly container = new Container();
  private readonly backgroundDim = new Graphics();
  private readonly blockerShadows = new Sprite(Texture.EMPTY);
  private readonly darknessOverlay = new Sprite(Texture.EMPTY);
  private blockerShadowCanvas: HTMLCanvasElement | null = null;
  private blockerShadowContext: CanvasRenderingContext2D | null = null;
  private blockerShadowTexture: Texture | null = null;
  private cachedTextureKey = "";

  constructor() {
    this.container.addChild(
      this.backgroundDim,
      this.darknessOverlay,
      this.blockerShadows,
    );
    this.darknessOverlay.anchor.set(0.5);
    this.container.visible = false;
  }

  public update(
    app: Application,
    visibility: LightsOutVisibilityContext | null,
    blockers: readonly VisibilityBlockerShape[],
    worldToScreen: WorldToScreen,
    overlayAlpha: number,
  ): void {
    if (overlayAlpha <= 0 || !visibility || !visibility.restricted) {
      this.container.visible = false;
      return;
    }

    this.container.visible = true;
    this.container.alpha = overlayAlpha;
    this.drawBackgroundDim(app);
    const visibleRadius = getVisibilityRadiusScreen(
      app,
      visibility,
      worldToScreen,
    );
    if (!visibleRadius) {
      this.container.visible = false;
      return;
    }

    this.darknessOverlay.position.set(visibleRadius.x, visibleRadius.y);
    this.updateDarknessOverlayTexture(app, visibleRadius.radius);
    this.updateBlockerShadowTexture(
      app,
      visibility,
      blockers,
      worldToScreen,
    );
  }

  private updateDarknessOverlayTexture(app: Application, radius: number): void {
    const extentRadius = Math.max(
      1,
      Math.hypot(app.screen.width, app.screen.height),
    );
    const radiusBucket =
      Math.round(radius / DARKNESS_TEXTURE_RADIUS_BUCKET) *
      DARKNESS_TEXTURE_RADIUS_BUCKET;
    const textureKey = [app.screen.width, app.screen.height, radiusBucket].join(
      ":",
    );
    if (textureKey !== this.cachedTextureKey) {
      this.cachedTextureKey = textureKey;
      this.darknessOverlay.texture = createLightsOutDarknessTexture(
        (radiusBucket * LIGHTS_OUT_FADE_START_RADIUS) /
          LIGHTS_OUT_FADE_END_RADIUS /
          extentRadius,
        radiusBucket / extentRadius,
      );
    }
    this.darknessOverlay.width = extentRadius * 2;
    this.darknessOverlay.height = extentRadius * 2;
  }

  private drawBackgroundDim(app: Application): void {
    this.backgroundDim
      .clear()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: DARKNESS_OVERLAY_COLOR, alpha: 0.2 });
  }

  private updateBlockerShadowTexture(
    app: Application,
    visibility: LightsOutVisibilityContext,
    blockers: readonly VisibilityBlockerShape[],
    worldToScreen: WorldToScreen,
  ): void {
    const canvas = this.getBlockerShadowCanvas(app);
    const context = this.blockerShadowContext;
    if (!context || !this.blockerShadowTexture) {
      this.blockerShadows.visible = false;
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawVisibilityBlockerShadows(
      app,
      context,
      visibility,
      blockers,
      worldToScreen,
    );
    this.blockerShadowTexture.source.update();
    this.blockerShadows.texture = this.blockerShadowTexture;
    this.blockerShadows.position.set(0, 0);
    this.blockerShadows.visible = true;
  }

  private getBlockerShadowCanvas(app: Application): HTMLCanvasElement {
    const width = Math.max(1, Math.ceil(app.screen.width));
    const height = Math.max(1, Math.ceil(app.screen.height));
    if (!this.blockerShadowCanvas) {
      this.blockerShadowCanvas = document.createElement("canvas");
      this.blockerShadowContext = this.blockerShadowCanvas.getContext("2d");
    }
    if (
      this.blockerShadowCanvas.width !== width ||
      this.blockerShadowCanvas.height !== height
    ) {
      this.blockerShadowCanvas.width = width;
      this.blockerShadowCanvas.height = height;
      this.blockerShadowTexture = Texture.from(this.blockerShadowCanvas);
    } else if (!this.blockerShadowTexture) {
      this.blockerShadowTexture = Texture.from(this.blockerShadowCanvas);
    }
    return this.blockerShadowCanvas;
  }
}

function getVisibilityRadiusScreen(
  app: Application,
  visibility: LightsOutVisibilityContext,
  worldToScreen: WorldToScreen,
): { x: number; y: number; radius: number } | null {
  const center = worldToScreen(app, visibility.center.x, visibility.center.y);
  const edge = worldToScreen(
    app,
    visibility.center.x + visibility.radius,
    visibility.center.y,
  );
  if (!center || !edge) {
    return null;
  }
  return {
    x: center.x,
    y: center.y,
    radius: Math.hypot(edge.x - center.x, edge.y - center.y),
  };
}

function drawVisibilityBlockerShadows(
  app: Application,
  context: CanvasRenderingContext2D,
  visibility: LightsOutVisibilityContext,
  blockers: readonly VisibilityBlockerShape[],
  worldToScreen: WorldToScreen,
): void {
  const visibleBlockers: VisibilityBlockerShape[] = [];
  context.save();
  context.fillStyle = "#000000";
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  for (const blocker of blockers) {
    const shadows =
      blocker.kind === "rect"
        ? buildRectBlockerShadows(visibility, blocker)
        : buildCircleBlockerShadow(visibility, blocker);
    let drewShadow = false;
    for (const shadow of shadows) {
      const points = shadow
        .map((point) => worldToScreenPoint(app, worldToScreen, point))
        .filter((point): point is ScreenPoint => point !== null);
      if (points.length !== shadow.length) {
        continue;
      }
      drawCanvasPolygon(context, points);
      context.fill();
      drewShadow = true;
    }
    if (drewShadow) {
      visibleBlockers.push(blocker);
    }
  }

  context.globalAlpha = 1;
  context.globalCompositeOperation = "destination-out";
  for (const blocker of visibleBlockers) {
    cutVisibilityBlockerFromShadows(app, context, blocker, worldToScreen);
  }
  context.restore();
}

function cutVisibilityBlockerFromShadows(
  app: Application,
  context: CanvasRenderingContext2D,
  blocker: VisibilityBlockerShape,
  worldToScreen: WorldToScreen,
): void {
  if (blocker.kind === "rect") {
    const points = getRectBlockerScreenPoints(app, blocker, worldToScreen);
    if (points) {
      drawCanvasPolygon(context, points);
      context.fill();
    }
    return;
  }

  const center = worldToScreenPoint(app, worldToScreen, {
    x: blocker.centerX,
    y: blocker.centerY,
  });
  const edgeX = worldToScreenPoint(app, worldToScreen, {
    x: blocker.centerX + blocker.radius,
    y: blocker.centerY,
  });
  const edgeY = worldToScreenPoint(app, worldToScreen, {
    x: blocker.centerX,
    y: blocker.centerY + blocker.radius,
  });
  if (!center || !edgeX || !edgeY) return;
  context.beginPath();
  context.ellipse(
    center.x,
    center.y,
    Math.abs(edgeX.x - center.x),
    Math.abs(edgeY.y - center.y),
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function buildRectBlockerShadows(
  visibility: LightsOutVisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "rect" }>,
): WorldPoint[][] {
  const origin = visibility.center;
  if (
    distanceToRect(origin, blocker) > visibility.radius ||
    pointInRect(origin, blocker)
  ) {
    return [];
  }
  const corners = [
    { x: blocker.minX, y: blocker.minY },
    { x: blocker.maxX, y: blocker.minY },
    { x: blocker.maxX, y: blocker.maxY },
    { x: blocker.minX, y: blocker.maxY },
  ] satisfies [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
  const edges: Array<readonly [WorldPoint, WorldPoint]> = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  return edges.flatMap(([a, b]) => buildProjectedTrapezoid(origin, a, b));
}

function buildCircleBlockerShadow(
  visibility: LightsOutVisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "circle" }>,
): WorldPoint[][] {
  const origin = visibility.center;
  const dx = blocker.centerX - origin.x;
  const dy = blocker.centerY - origin.y;
  const distance = Math.hypot(dx, dy);
  if (
    distance > visibility.radius ||
    distance <= blocker.radius + MIN_DISTANCE_EPSILON
  ) {
    return [];
  }
  const nx = -dy / distance;
  const ny = dx / distance;
  const a = {
    x: blocker.centerX + nx * blocker.radius,
    y: blocker.centerY + ny * blocker.radius,
  };
  const b = {
    x: blocker.centerX - nx * blocker.radius,
    y: blocker.centerY - ny * blocker.radius,
  };
  return buildProjectedTrapezoid(origin, a, b);
}

function buildProjectedTrapezoid(
  origin: WorldPoint,
  a: WorldPoint,
  b: WorldPoint,
): WorldPoint[][] {
  const farA = extendWorldPointFromOrigin(origin, a, WORLD_SHADOW_EXTENSION);
  const farB = extendWorldPointFromOrigin(origin, b, WORLD_SHADOW_EXTENSION);
  if (!farA || !farB) {
    return [];
  }
  return [[a, farA, farB, b]];
}

function extendWorldPointFromOrigin(
  origin: WorldPoint,
  point: WorldPoint,
  distance: number,
): WorldPoint | null {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= MIN_DISTANCE_EPSILON) {
    return null;
  }
  return {
    x: origin.x + (dx / length) * distance,
    y: origin.y + (dy / length) * distance,
  };
}

function distanceToRect(
  point: WorldPoint,
  rect: Extract<VisibilityBlockerShape, { kind: "rect" }>,
): number {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dy = Math.max(rect.minY - point.y, 0, point.y - rect.maxY);
  return Math.hypot(dx, dy);
}

function pointInRect(
  point: WorldPoint,
  rect: Extract<VisibilityBlockerShape, { kind: "rect" }>,
): boolean {
  return (
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.y >= rect.minY &&
    point.y <= rect.maxY
  );
}

function worldToScreenPoint(
  app: Application,
  worldToScreen: WorldToScreen,
  point: WorldPoint,
): ScreenPoint | null {
  return worldToScreen(app, point.x, point.y);
}

function getRectBlockerScreenPoints(
  app: Application,
  blocker: Extract<VisibilityBlockerShape, { kind: "rect" }>,
  worldToScreen: WorldToScreen,
): ScreenPoint[] | null {
  const points = [
    worldToScreenPoint(app, worldToScreen, {
      x: blocker.minX,
      y: blocker.minY,
    }),
    worldToScreenPoint(app, worldToScreen, {
      x: blocker.maxX,
      y: blocker.minY,
    }),
    worldToScreenPoint(app, worldToScreen, {
      x: blocker.maxX,
      y: blocker.maxY,
    }),
    worldToScreenPoint(app, worldToScreen, {
      x: blocker.minX,
      y: blocker.maxY,
    }),
  ];
  if (points.some((point) => point === null)) {
    return null;
  }
  return points as ScreenPoint[];
}

function drawCanvasPolygon(
  context: CanvasRenderingContext2D,
  points: readonly ScreenPoint[],
): void {
  const first = points[0];
  if (!first) {
    return;
  }
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
}

function smootherstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function createLightsOutDarknessTexture(
  fadeStartRatio: number,
  fadeEndRatio: number,
): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE;
  canvas.height = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return Texture.EMPTY;
  }
  const image = context.createImageData(canvas.width, canvas.height);
  const center = (LIGHTS_OUT_FALLOFF_TEXTURE_SIZE - 1) / 2;
  const outerRadius = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE / 2;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distanceRatio = Math.hypot(dx, dy) / outerRadius;
      const fadeRatio =
        (distanceRatio - fadeStartRatio) / (fadeEndRatio - fadeStartRatio);
      const alpha = smootherstep(fadeRatio);
      const index = (y * canvas.width + x) * 4;
      image.data[index] = 0;
      image.data[index + 1] = 0;
      image.data[index + 2] = 0;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}
