import {
  Container,
  Graphics,
  Sprite,
  Texture,
  type Application,
} from "pixi.js";
import type {
  LightsOutVisibilityContext,
  VisibilityBlockerRect,
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
const LIGHTS_OUT_FALLOFF_TEXTURE_SIZE = 4096;
const DARKNESS_TEXTURE_FADE_END_RATIO = 0.125;
const DARKNESS_TEXTURE_FADE_START_RATIO =
  DARKNESS_TEXTURE_FADE_END_RATIO *
  (LIGHTS_OUT_FADE_START_RADIUS / LIGHTS_OUT_FADE_END_RADIUS);
const DARKNESS_OVERLAY_COLOR = 0x000000;

export class PixiLightsOutOverlay {
  public readonly container = new Container();
  private readonly backgroundDim = new Graphics();
  private readonly blockerShadows = new Sprite(Texture.EMPTY);
  private readonly darknessOverlay = new Sprite(Texture.EMPTY);
  private blockerShadowCanvas: HTMLCanvasElement | null = null;
  private blockerShadowContext: CanvasRenderingContext2D | null = null;
  private blockerShadowTexture: Texture | null = null;
  private blockerScratchCanvas: HTMLCanvasElement | null = null;
  private blockerScratchContext: CanvasRenderingContext2D | null = null;

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
    this.updateDarknessOverlay(visibleRadius.radius);
    this.updateBlockerShadowTexture(app, visibility, blockers, worldToScreen);
  }

  private updateDarknessOverlay(radius: number): void {
    if (this.darknessOverlay.texture === Texture.EMPTY) {
      this.darknessOverlay.texture = createLightsOutDarknessTexture();
    }
    const overlayRadius = Math.max(1, radius / DARKNESS_TEXTURE_FADE_END_RATIO);
    this.darknessOverlay.width = overlayRadius * 2;
    this.darknessOverlay.height = overlayRadius * 2;
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
      this.getBlockerScratchContext(canvas),
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

  private getBlockerScratchContext(
    targetCanvas: HTMLCanvasElement,
  ): CanvasRenderingContext2D | null {
    if (!this.blockerScratchCanvas) {
      this.blockerScratchCanvas = document.createElement("canvas");
      this.blockerScratchContext = this.blockerScratchCanvas.getContext("2d");
    }
    if (
      this.blockerScratchCanvas.width !== targetCanvas.width ||
      this.blockerScratchCanvas.height !== targetCanvas.height
    ) {
      this.blockerScratchCanvas.width = targetCanvas.width;
      this.blockerScratchCanvas.height = targetCanvas.height;
    }
    return this.blockerScratchContext;
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
  targetContext: CanvasRenderingContext2D,
  scratchContext: CanvasRenderingContext2D | null,
  visibility: LightsOutVisibilityContext,
  blockers: readonly VisibilityBlockerShape[],
  worldToScreen: WorldToScreen,
): void {
  if (!scratchContext) {
    return;
  }
  const width = targetContext.canvas.width;
  const height = targetContext.canvas.height;
  targetContext.save();
  targetContext.globalAlpha = 1;
  targetContext.globalCompositeOperation = "source-over";
  scratchContext.save();
  for (const blocker of blockers) {
    const shadows =
      blocker.kind === "rects"
        ? buildRectSetBlockerShadows(visibility, blocker.rects)
        : buildCircleBlockerShadow(visibility, blocker);
    scratchContext.clearRect(0, 0, width, height);
    scratchContext.fillStyle = "#000000";
    scratchContext.globalAlpha = 1;
    scratchContext.globalCompositeOperation = "source-over";
    let drewShadow = false;
    for (const shadow of shadows) {
      const points = shadow
        .map((point) => worldToScreenPoint(app, worldToScreen, point))
        .filter((point): point is ScreenPoint => point !== null);
      if (points.length !== shadow.length) {
        continue;
      }
      drawCanvasPolygon(scratchContext, points);
      scratchContext.fill();
      drewShadow = true;
    }
    if (!drewShadow) {
      continue;
    }
    scratchContext.globalCompositeOperation = "destination-out";
    cutVisibilityBlockerFromShadows(
      app,
      scratchContext,
      blocker,
      worldToScreen,
    );
    targetContext.drawImage(scratchContext.canvas, 0, 0);
  }
  scratchContext.restore();
  targetContext.restore();
}

function cutVisibilityBlockerFromShadows(
  app: Application,
  context: CanvasRenderingContext2D,
  blocker: VisibilityBlockerShape,
  worldToScreen: WorldToScreen,
): void {
  if (blocker.kind === "rects") {
    for (const rect of blocker.rects) {
      const points = getRectBlockerScreenPoints(app, rect, worldToScreen);
      if (points) {
        drawCanvasPolygon(context, points);
        context.fill();
      }
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

function buildRectSetBlockerShadows(
  visibility: LightsOutVisibilityContext,
  rects: readonly VisibilityBlockerRect[],
): WorldPoint[][] {
  return rects.flatMap((rect) => buildRectBlockerShadows(visibility, rect));
}

export function countVisibilityShadowPolygonsForBenchmark(
  visibility: LightsOutVisibilityContext,
  blockers: readonly VisibilityBlockerShape[],
): number {
  let count = 0;
  for (const blocker of blockers) {
    if (blocker.kind === "rects") {
      for (const rect of blocker.rects) {
        count += isRectBlockerShadowRelevant(visibility, rect) ? 4 : 0;
      }
    } else {
      count += isCircleBlockerShadowRelevant(visibility, blocker) ? 1 : 0;
    }
  }
  return count;
}

function buildRectBlockerShadows(
  visibility: LightsOutVisibilityContext,
  rect: VisibilityBlockerRect,
): WorldPoint[][] {
  const origin = visibility.center;
  if (!isRectBlockerShadowRelevant(visibility, rect)) {
    return [];
  }
  const corners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
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
  if (!isCircleBlockerShadowRelevant(visibility, blocker)) {
    return [];
  }
  const dx = blocker.centerX - origin.x;
  const dy = blocker.centerY - origin.y;
  const distance = Math.hypot(dx, dy);
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

function isRectBlockerShadowRelevant(
  visibility: LightsOutVisibilityContext,
  rect: VisibilityBlockerRect,
): boolean {
  const origin = visibility.center;
  const radiusSquared = visibility.radius * visibility.radius;
  return (
    distanceToRectSquared(origin, rect) <= radiusSquared &&
    !pointInRect(origin, rect)
  );
}

function isCircleBlockerShadowRelevant(
  visibility: LightsOutVisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "circle" }>,
): boolean {
  const origin = visibility.center;
  const dx = blocker.centerX - origin.x;
  const dy = blocker.centerY - origin.y;
  const distanceSquared = dx * dx + dy * dy;
  const minDistance = blocker.radius + MIN_DISTANCE_EPSILON;
  return (
    distanceSquared <= visibility.radius * visibility.radius &&
    distanceSquared > minDistance * minDistance
  );
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

function distanceToRectSquared(
  point: WorldPoint,
  rect: VisibilityBlockerRect,
): number {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dy = Math.max(rect.minY - point.y, 0, point.y - rect.maxY);
  return dx * dx + dy * dy;
}

function pointInRect(point: WorldPoint, rect: VisibilityBlockerRect): boolean {
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
  blocker: VisibilityBlockerRect,
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

function createLightsOutDarknessTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE;
  canvas.height = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return Texture.EMPTY;
  }
  const center = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE / 2;
  const outerRadius = LIGHTS_OUT_FALLOFF_TEXTURE_SIZE / 2;
  const startRadius = Math.max(
    0,
    DARKNESS_TEXTURE_FADE_START_RATIO * outerRadius,
  );
  const endRadius = Math.max(
    startRadius + 1,
    DARKNESS_TEXTURE_FADE_END_RATIO * outerRadius,
  );
  const gradient = context.createRadialGradient(
    center,
    center,
    startRadius,
    center,
    center,
    endRadius,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.18, alphaStop(0.08));
  gradient.addColorStop(0.5, alphaStop(0.5));
  gradient.addColorStop(0.82, alphaStop(0.92));
  gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "linear";
  return texture;
}

function alphaStop(t: number): string {
  return `rgba(0, 0, 0, ${smootherstep(t).toFixed(4)})`;
}
