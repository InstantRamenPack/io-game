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

type ScreenTransform = {
  scaleX: number;
  scaleY: number;
  centerX: number;
  centerY: number;
  offsetX: number;
  offsetY: number;
};

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
/** Extra screen-space cutout around blockers to avoid shadow hairlines at edges. */
const BLOCKER_CUTOUT_OUTLINE_PX = 0.1;
const BLOCKER_CULL_MARGIN_SCREEN = 300;

export class PixiLightsOutOverlay {
  public readonly container = new Container();
  private readonly backgroundDim = new Graphics();
  private readonly darknessOverlay = new Sprite(Texture.EMPTY);
  private readonly blockerShadows = new Sprite(Texture.EMPTY);
  private blockerShadowCanvas: HTMLCanvasElement | null = null;
  private blockerShadowContext: CanvasRenderingContext2D | null = null;
  private blockerShadowTexture: Texture | null = null;
  private blockerScratchCanvas: HTMLCanvasElement | null = null;
  private blockerScratchContext: CanvasRenderingContext2D | null = null;
  private lastScreenW = -1;
  private lastScreenH = -1;

  constructor() {
    this.container.addChild(
      this.backgroundDim,
      this.darknessOverlay,
      this.blockerShadows,
    );
    this.darknessOverlay.anchor.set(0.5);
    this.container.visible = false;
  }

  public warmUp(): void {
    if (this.darknessOverlay.texture === Texture.EMPTY) {
      this.darknessOverlay.texture = createLightsOutDarknessTexture();
    }
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
    const transform = this.getScreenTransform(app, visibility, worldToScreen);
    if (!transform) {
      this.container.visible = false;
      return;
    }

    this.darknessOverlay.position.set(transform.centerX, transform.centerY);
    this.updateDarknessOverlay(transform.radius);
    this.updateBlockerShadowTexture(app, visibility, blockers, transform);
  }

  private drawBackgroundDim(app: Application): void {
    if (
      this.lastScreenW === app.screen.width &&
      this.lastScreenH === app.screen.height
    ) {
      return;
    }
    this.lastScreenW = app.screen.width;
    this.lastScreenH = app.screen.height;
    this.backgroundDim
      .clear()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: DARKNESS_OVERLAY_COLOR, alpha: 0.2 });
  }

  private updateDarknessOverlay(radius: number): void {
    if (this.darknessOverlay.texture === Texture.EMPTY) {
      this.darknessOverlay.texture = createLightsOutDarknessTexture();
    }
    const overlayRadius = Math.max(1, radius / DARKNESS_TEXTURE_FADE_END_RATIO);
    this.darknessOverlay.width = overlayRadius * 2;
    this.darknessOverlay.height = overlayRadius * 2;
  }

  private updateBlockerShadowTexture(
    app: Application,
    visibility: LightsOutVisibilityContext,
    blockers: readonly VisibilityBlockerShape[],
    transform: ScreenTransform & { radius: number },
  ): void {
    const canvas = this.getBlockerShadowCanvas(app);
    const context = this.blockerShadowContext;
    const scratchContext = this.getBlockerScratchContext(canvas);
    if (!context || !scratchContext || !this.blockerShadowTexture) {
      this.blockerShadows.visible = false;
      return;
    }

    const sorted = blockers
      .filter((blocker) =>
        blockerIntersectsActiveViewport(blocker, app, transform),
      )
      .slice()
      .sort(
        (a, b) =>
          blockerDistanceSq(a, visibility.center) -
          blockerDistanceSq(b, visibility.center),
      );

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";

    const accepted: WorldPoint[][][] = [];
    for (const blocker of sorted) {
      const shadows =
        blocker.kind === "rects"
          ? buildRectSetBlockerShadows(visibility, blocker.rects)
          : buildCircleBlockerShadow(visibility, blocker);
      if (shadows.length === 0) {
        continue;
      }
      if (isBlockerFullyCovered(blocker, accepted)) {
        continue;
      }
      accepted.push(shadows);

      scratchContext.clearRect(0, 0, canvas.width, canvas.height);
      scratchContext.save();
      scratchContext.fillStyle = "#000000";
      scratchContext.globalAlpha = 1;
      scratchContext.globalCompositeOperation = "source-over";

      let drewShadow = false;
      for (let i = 0; i < shadows.length; i += 1) {
        const points = shadows[i];
        if (!points || points.length < 3) {
          continue;
        }
        drawCanvasPolygon(scratchContext, toScreenPolygon(points, transform));
        scratchContext.fill();
        drewShadow = true;
      }

      if (!drewShadow) {
        scratchContext.restore();
        continue;
      }

      scratchContext.globalCompositeOperation = "destination-out";
      cutVisibilityBlockerFromShadow(scratchContext, blocker, transform);
      scratchContext.restore();
      context.drawImage(scratchContext.canvas, 0, 0);
    }

    context.restore();
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

  private getScreenTransform(
    app: Application,
    visibility: LightsOutVisibilityContext,
    worldToScreen: WorldToScreen,
  ): (ScreenTransform & { radius: number }) | null {
    const center = worldToScreen(app, visibility.center.x, visibility.center.y);
    const edgeX = worldToScreen(
      app,
      visibility.center.x + visibility.radius,
      visibility.center.y,
    );
    const edgeY = worldToScreen(
      app,
      visibility.center.x,
      visibility.center.y + visibility.radius,
    );
    if (!center || !edgeX || !edgeY) {
      return null;
    }
    const scaleX = (edgeX.x - center.x) / visibility.radius;
    const scaleY = (edgeY.y - center.y) / visibility.radius;
    return {
      scaleX,
      scaleY,
      centerX: center.x,
      centerY: center.y,
      offsetX: center.x - visibility.center.x * scaleX,
      offsetY: center.y - visibility.center.y * scaleY,
      radius: Math.max(
        Math.abs(edgeX.x - center.x),
        Math.abs(edgeY.y - center.y),
      ),
    };
  }
}

function blockerDistanceSq(
  blocker: VisibilityBlockerShape,
  center: { x: number; y: number },
): number {
  if (blocker.kind === "circle") {
    const dx = blocker.centerX - center.x;
    const dy = blocker.centerY - center.y;
    return dx * dx + dy * dy;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < blocker.rects.length; i += 1) {
    const rect = blocker.rects[i];
    if (!rect) continue;
    if (rect.minX < minX) minX = rect.minX;
    if (rect.minY < minY) minY = rect.minY;
    if (rect.maxX > maxX) maxX = rect.maxX;
    if (rect.maxY > maxY) maxY = rect.maxY;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = cx - center.x;
  const dy = cy - center.y;
  return dx * dx + dy * dy;
}

function blockerIntersectsActiveViewport(
  blocker: VisibilityBlockerShape,
  app: Application,
  transform: ScreenTransform,
): boolean {
  const screen = {
    minX: -BLOCKER_CULL_MARGIN_SCREEN,
    minY: -BLOCKER_CULL_MARGIN_SCREEN,
    maxX: app.screen.width + BLOCKER_CULL_MARGIN_SCREEN,
    maxY: app.screen.height + BLOCKER_CULL_MARGIN_SCREEN,
  };

  if (blocker.kind === "circle") {
    const centerX = blocker.centerX * transform.scaleX + transform.offsetX;
    const centerY = blocker.centerY * transform.scaleY + transform.offsetY;
    const radiusX = Math.abs(blocker.radius * transform.scaleX);
    const radiusY = Math.abs(blocker.radius * transform.scaleY);
    return (
      centerX + radiusX >= screen.minX &&
      centerX - radiusX <= screen.maxX &&
      centerY + radiusY >= screen.minY &&
      centerY - radiusY <= screen.maxY
    );
  }

  for (let i = 0; i < blocker.rects.length; i += 1) {
    const rect = blocker.rects[i];
    if (!rect) continue;
    const bounds = getRectBlockerScreenBounds(rect, transform, 0);
    if (
      bounds.maxX >= screen.minX &&
      bounds.minX <= screen.maxX &&
      bounds.maxY >= screen.minY &&
      bounds.minY <= screen.maxY
    ) {
      return true;
    }
  }
  return false;
}

function isBlockerFullyCovered(
  blocker: VisibilityBlockerShape,
  existingShadows: readonly WorldPoint[][][],
): boolean {
  if (existingShadows.length === 0) {
    return false;
  }
  const vertices: WorldPoint[] =
    blocker.kind === "circle"
      ? [
          { x: blocker.centerX + blocker.radius, y: blocker.centerY },
          { x: blocker.centerX - blocker.radius, y: blocker.centerY },
          { x: blocker.centerX, y: blocker.centerY + blocker.radius },
          { x: blocker.centerX, y: blocker.centerY - blocker.radius },
        ]
      : blocker.rects.flatMap((rect) => [
          { x: rect.minX, y: rect.minY },
          { x: rect.maxX, y: rect.minY },
          { x: rect.maxX, y: rect.maxY },
          { x: rect.minX, y: rect.maxY },
        ]);

  for (let i = 0; i < vertices.length; i += 1) {
    const vertex = vertices[i];
    if (!vertex) {
      continue;
    }
    let covered = false;
    for (let s = 0; s < existingShadows.length && !covered; s += 1) {
      const group = existingShadows[s];
      if (!group) continue;
      for (let p = 0; p < group.length; p += 1) {
        const poly = group[p];
        if (!poly) continue;
        if (pointInPolygon(vertex, poly)) {
          covered = true;
          break;
        }
      }
    }
    if (!covered) {
      return false;
    }
  }

  return true;
}

function pointInPolygon(
  point: WorldPoint,
  polygon: readonly WorldPoint[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) /
          (pj.y - pi.y + MIN_DISTANCE_EPSILON) +
          pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function toScreenPolygon(
  points: readonly WorldPoint[],
  transform: ScreenTransform,
): number[] {
  const out = new Array<number>(points.length * 2);
  let n = 0;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    out[n++] = point.x * transform.scaleX + transform.offsetX;
    out[n++] = point.y * transform.scaleY + transform.offsetY;
  }
  return out;
}

function cutVisibilityBlockerFromShadow(
  context: CanvasRenderingContext2D,
  blocker: VisibilityBlockerShape,
  transform: ScreenTransform,
): void {
  if (blocker.kind === "rects") {
    for (let i = 0; i < blocker.rects.length; i += 1) {
      const rect = blocker.rects[i];
      if (!rect) {
        continue;
      }
      drawCanvasPolygon(context, getRectBlockerScreenPoints(rect, transform));
      context.fill();
    }
    return;
  }

  const centerX = blocker.centerX * transform.scaleX + transform.offsetX;
  const centerY = blocker.centerY * transform.scaleY + transform.offsetY;
  const rx =
    Math.abs(blocker.radius * transform.scaleX) + BLOCKER_CUTOUT_OUTLINE_PX;
  const ry =
    Math.abs(blocker.radius * transform.scaleY) + BLOCKER_CUTOUT_OUTLINE_PX;
  context.beginPath();
  context.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
  context.fill();
}

function drawCanvasPolygon(
  context: CanvasRenderingContext2D,
  points: readonly number[],
): void {
  if (points.length < 6) {
    return;
  }
  context.beginPath();
  context.moveTo(points[0] ?? 0, points[1] ?? 0);
  for (let i = 2; i < points.length; i += 2) {
    context.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
  }
  context.closePath();
}

function buildRectSetBlockerShadows(
  visibility: LightsOutVisibilityContext,
  rects: readonly VisibilityBlockerRect[],
): WorldPoint[][] {
  const out: WorldPoint[][] = [];
  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i];
    if (!rect) continue;
    const shadows = buildRectBlockerShadows(visibility, rect);
    for (let j = 0; j < shadows.length; j += 1) {
      const shadow = shadows[j];
      if (shadow) {
        out.push(shadow);
      }
    }
  }
  return out;
}

export function countVisibilityShadowPolygonsForBenchmark(
  visibility: LightsOutVisibilityContext,
  blockers: readonly VisibilityBlockerShape[],
): number {
  let count = 0;
  for (const blocker of blockers) {
    if (blocker.kind === "rects") {
      for (const rect of blocker.rects) {
        count += shouldProjectRectBlockerShadow(visibility, rect) ? 4 : 0;
      }
    } else {
      count += shouldProjectCircleBlockerShadow(visibility, blocker) ? 1 : 0;
    }
  }
  return count;
}

function buildRectBlockerShadows(
  visibility: LightsOutVisibilityContext,
  rect: VisibilityBlockerRect,
): WorldPoint[][] {
  const origin = visibility.center;
  if (!shouldProjectRectBlockerShadow(visibility, rect)) {
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
  const out: WorldPoint[][] = [];
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (!edge) continue;
    const projected = buildProjectedTrapezoid(origin, edge[0], edge[1]);
    for (let j = 0; j < projected.length; j += 1) {
      const shape = projected[j];
      if (shape) out.push(shape);
    }
  }
  return out;
}

function buildCircleBlockerShadow(
  visibility: LightsOutVisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "circle" }>,
): WorldPoint[][] {
  const origin = visibility.center;
  if (!shouldProjectCircleBlockerShadow(visibility, blocker)) {
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

function shouldProjectRectBlockerShadow(
  visibility: LightsOutVisibilityContext,
  rect: VisibilityBlockerRect,
): boolean {
  return !pointInRect(visibility.center, rect);
}

function shouldProjectCircleBlockerShadow(
  visibility: LightsOutVisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "circle" }>,
): boolean {
  const origin = visibility.center;
  const dx = blocker.centerX - origin.x;
  const dy = blocker.centerY - origin.y;
  const distanceSquared = dx * dx + dy * dy;
  const minDistance = blocker.radius + MIN_DISTANCE_EPSILON;
  return distanceSquared > minDistance * minDistance;
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

function pointInRect(point: WorldPoint, rect: VisibilityBlockerRect): boolean {
  return (
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.y >= rect.minY &&
    point.y <= rect.maxY
  );
}

function getRectBlockerScreenPoints(
  blocker: VisibilityBlockerRect,
  transform: ScreenTransform,
): number[] {
  const bounds = getRectBlockerScreenBounds(
    blocker,
    transform,
    BLOCKER_CUTOUT_OUTLINE_PX,
  );
  return [
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY,
    bounds.minX,
    bounds.maxY,
  ];
}

function getRectBlockerScreenBounds(
  blocker: VisibilityBlockerRect,
  transform: ScreenTransform,
  expansionPx: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const x0 = blocker.minX * transform.scaleX + transform.offsetX;
  const y0 = blocker.minY * transform.scaleY + transform.offsetY;
  const x1 = blocker.maxX * transform.scaleX + transform.offsetX;
  const y1 = blocker.maxY * transform.scaleY + transform.offsetY;

  let minX = x0;
  let maxX = x0;
  let minY = y0;
  let maxY = y0;

  if (x1 < minX) minX = x1;
  if (x1 > maxX) maxX = x1;
  if (y1 < minY) minY = y1;
  if (y1 > maxY) maxY = y1;

  minX -= expansionPx;
  maxX += expansionPx;
  minY -= expansionPx;
  maxY += expansionPx;

  return { minX, minY, maxX, maxY };
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
