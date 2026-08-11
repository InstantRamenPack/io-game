import {
  Container,
  Graphics,
  RenderTexture,
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

type BlockerLayer = {
  shadow: Graphics;
  cutout: Graphics;
};

const MIN_DISTANCE_EPSILON = 1e-6;
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
const TRANSPARENT_CLEAR: [number, number, number, number] = [0, 0, 0, 0];

export class PixiLightsOutOverlay {
  public readonly container = new Container();
  private readonly backgroundDim = new Graphics();
  private readonly darknessOverlay = new Sprite(Texture.EMPTY);
  private readonly blockerShadows = new Sprite(Texture.EMPTY);
  private readonly blockerBatchRoot = new Container();
  private readonly blockerLayers: BlockerLayer[] = [];
  private accumRenderTexture: RenderTexture | null = null;
  private lastScreenW = -1;
  private lastScreenH = -1;
  private lastShadowScreenW = -1;
  private lastShadowScreenH = -1;

  constructor() {
    this.blockerBatchRoot.cullable = false;
    this.blockerBatchRoot.cullableChildren = false;
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
    const sorted = blockers
      .filter((blocker) =>
        blockerIntersectsActiveViewport(blocker, app, transform),
      )
      .slice()
      .sort(
        (a, b) =>
          blockerDistanceSq(b, visibility.center) -
          blockerDistanceSq(a, visibility.center),
      );

    const accumTexture = this.ensureAccumRenderTexture(app);
    this.blockerBatchRoot.filterArea = app.screen;
    let layerCount = 0;

    for (const blocker of sorted) {
      const shadows =
        blocker.kind === "rects"
          ? buildRectSetBlockerShadows(
              visibility,
              blocker.rects,
              app,
              transform,
            )
          : buildCircleBlockerShadow(visibility, blocker, app, transform);
      if (shadows.length === 0) {
        continue;
      }
      const layer = this.getBlockerLayer(layerCount);
      if (!populateBlockerShadowGraphics(layer.shadow, shadows)) {
        continue;
      }
      populateBlockerCutoutGraphics(layer.cutout, blocker, transform);
      layer.shadow.visible = true;
      layer.cutout.visible = true;
      layerCount += 1;
    }

    for (let i = layerCount; i < this.blockerLayers.length; i += 1) {
      const layer = this.blockerLayers[i];
      if (!layer) continue;
      layer.shadow.visible = false;
      layer.cutout.visible = false;
    }

    if (layerCount === 0) {
      this.blockerShadows.visible = false;
      return;
    }

    app.renderer.render({
      container: this.blockerBatchRoot,
      target: accumTexture,
      clear: true,
      clearColor: TRANSPARENT_CLEAR,
    });

    this.blockerShadows.texture = accumTexture;
    this.blockerShadows.width = app.screen.width;
    this.blockerShadows.height = app.screen.height;
    this.blockerShadows.position.set(0, 0);
    this.blockerShadows.visible = true;
  }

  private getBlockerLayer(index: number): BlockerLayer {
    const existing = this.blockerLayers[index];
    if (existing) {
      return existing;
    }
    const layer = {
      shadow: new Graphics(),
      cutout: new Graphics(),
    };
    layer.cutout.blendMode = "erase";
    this.blockerLayers.push(layer);
    this.blockerBatchRoot.addChild(layer.shadow, layer.cutout);
    return layer;
  }

  private ensureAccumRenderTexture(app: Application): RenderTexture {
    const width = Math.max(1, Math.ceil(app.screen.width));
    const height = Math.max(1, Math.ceil(app.screen.height));
    const resolution = app.renderer.resolution;

    if (
      !this.accumRenderTexture ||
      this.lastShadowScreenW !== width ||
      this.lastShadowScreenH !== height
    ) {
      this.accumRenderTexture?.destroy(true);
      this.accumRenderTexture = RenderTexture.create({
        width,
        height,
        resolution,
        dynamic: true,
      });
      this.lastShadowScreenW = width;
      this.lastShadowScreenH = height;
    }

    return this.accumRenderTexture;
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

function populateBlockerShadowGraphics(
  graphics: Graphics,
  shadows: readonly number[][],
): boolean {
  graphics.clear();
  let drewShadow = false;
  for (let i = 0; i < shadows.length; i += 1) {
    const screenPoints = shadows[i];
    if (!screenPoints || screenPoints.length < 6) {
      continue;
    }
    graphics.poly(screenPoints).fill({ color: 0x000000, alpha: 1 });
    drewShadow = true;
  }
  return drewShadow;
}

function populateBlockerCutoutGraphics(
  graphics: Graphics,
  blocker: VisibilityBlockerShape,
  transform: ScreenTransform,
): void {
  graphics.clear();
  if (blocker.kind === "rects") {
    for (let i = 0; i < blocker.rects.length; i += 1) {
      const rect = blocker.rects[i];
      if (!rect) {
        continue;
      }
      graphics
        .poly(getRectBlockerScreenPoints(rect, transform))
        .fill({ color: 0xffffff, alpha: 1 });
    }
    return;
  }

  const centerX = blocker.centerX * transform.scaleX + transform.offsetX;
  const centerY = blocker.centerY * transform.scaleY + transform.offsetY;
  const rx =
    Math.abs(blocker.radius * transform.scaleX) + BLOCKER_CUTOUT_OUTLINE_PX;
  const ry =
    Math.abs(blocker.radius * transform.scaleY) + BLOCKER_CUTOUT_OUTLINE_PX;
  graphics.ellipse(centerX, centerY, rx, ry);
  graphics.fill({ color: 0xffffff, alpha: 1 });
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

function getShadowClipViewport(app: Application): ScreenPoint[] {
  return [
    { x: 0, y: 0 },
    { x: app.screen.width, y: 0 },
    { x: app.screen.width, y: app.screen.height },
    { x: 0, y: app.screen.height },
  ];
}

function worldToScreenPoint(
  point: WorldPoint,
  transform: ScreenTransform,
): ScreenPoint {
  return {
    x: point.x * transform.scaleX + transform.offsetX,
    y: point.y * transform.scaleY + transform.offsetY,
  };
}

function flattenScreenPolygon(points: readonly ScreenPoint[]): number[] {
  const out = new Array<number>(points.length * 2);
  let n = 0;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    out[n++] = point.x;
    out[n++] = point.y;
  }
  return out;
}

function buildRectSetBlockerShadows(
  visibility: LightsOutVisibilityContext,
  rects: readonly VisibilityBlockerRect[],
  app: Application,
  transform: ScreenTransform,
): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i];
    if (!rect) continue;
    const shadows = buildRectBlockerShadows(visibility, rect, app, transform);
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
  app: Application,
  transform: ScreenTransform,
): number[][] {
  const origin = visibility.center;
  if (!shouldProjectRectBlockerShadow(visibility, rect)) {
    return [];
  }
  const originScreen = worldToScreenPoint(origin, transform);
  const viewportCorners = getShadowClipViewport(app);
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
  const out: number[][] = [];
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (!edge) continue;
    if (!isSilhouetteEdge(origin, edge[0], edge[1])) {
      continue;
    }
    const shadow = buildEdgeShadowPolygon(
      originScreen,
      worldToScreenPoint(edge[0], transform),
      worldToScreenPoint(edge[1], transform),
      viewportCorners,
    );
    if (shadow) {
      out.push(shadow);
    }
  }
  return out;
}

function buildCircleBlockerShadow(
  visibility: LightsOutVisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "circle" }>,
  app: Application,
  transform: ScreenTransform,
): number[][] {
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
  const shadow = buildEdgeShadowPolygon(
    worldToScreenPoint(origin, transform),
    worldToScreenPoint(a, transform),
    worldToScreenPoint(b, transform),
    getShadowClipViewport(app),
  );
  return shadow ? [shadow] : [];
}

function shouldProjectRectBlockerShadow(
  visibility: LightsOutVisibilityContext,
  rect: VisibilityBlockerRect,
): boolean {
  return !pointInRect(visibility.center, rect);
}

function isSilhouetteEdge(
  origin: WorldPoint,
  a: WorldPoint,
  b: WorldPoint,
): boolean {
  const cross = (b.x - a.x) * (origin.y - a.y) - (b.y - a.y) * (origin.x - a.x);
  return cross < 0;
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

function buildEdgeShadowPolygon(
  origin: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
  viewportCorners: readonly ScreenPoint[],
): number[] | null {
  const poly = getShadowCoverageRegion(viewportCorners, origin, a, b);
  if (poly.length < 3) {
    return null;
  }
  return flattenScreenPolygon(poly);
}

function getShadowCoverageRegion(
  viewportCorners: readonly ScreenPoint[],
  origin: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
): ScreenPoint[] {
  if (viewportCorners.length < 3) {
    return [];
  }

  let poly = viewportCorners.slice();
  const edgeCrossOrigin = cross2d(
    b.x - a.x,
    b.y - a.y,
    origin.x - a.x,
    origin.y - a.y,
  );
  if (Math.abs(edgeCrossOrigin) <= MIN_DISTANCE_EPSILON) {
    return [];
  }

  poly = clipPolygonAgainstLineSide(
    poly,
    a,
    b,
    (point) =>
      edgeCrossOrigin *
        cross2d(b.x - a.x, b.y - a.y, point.x - a.x, point.y - a.y) <=
      0,
  );

  const toA = { x: a.x - origin.x, y: a.y - origin.y };
  const toB = { x: b.x - origin.x, y: b.y - origin.y };
  const crossAB = cross2d(toA.x, toA.y, toB.x, toB.y);
  if (Math.abs(crossAB) <= MIN_DISTANCE_EPSILON) {
    return poly;
  }

  poly = clipPolygonAgainstLineSide(poly, origin, a, (point) => {
    const crossAP = cross2d(
      toA.x,
      toA.y,
      point.x - origin.x,
      point.y - origin.y,
    );
    return crossAP * crossAB >= 0;
  });
  poly = clipPolygonAgainstLineSide(poly, origin, b, (point) => {
    const crossPB = cross2d(
      point.x - origin.x,
      point.y - origin.y,
      toB.x,
      toB.y,
    );
    return crossPB * crossAB >= 0;
  });

  return poly;
}

function clipPolygonAgainstLineSide(
  polygon: readonly ScreenPoint[],
  lineStart: ScreenPoint,
  lineEnd: ScreenPoint,
  inside: (point: ScreenPoint) => boolean,
): ScreenPoint[] {
  if (polygon.length === 0) {
    return [];
  }
  const output: ScreenPoint[] = [];
  let previous = polygon[polygon.length - 1];
  if (!previous) {
    return [];
  }
  let previousInside = inside(previous);

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    if (!current) continue;
    const currentInside = inside(current);
    if (currentInside) {
      if (!previousInside) {
        output.push(intersectSegments(previous, current, lineStart, lineEnd));
      }
      output.push(current);
    } else if (previousInside) {
      output.push(intersectSegments(previous, current, lineStart, lineEnd));
    }
    previous = current;
    previousInside = currentInside;
  }

  return output;
}

function intersectSegments(
  a1: ScreenPoint,
  a2: ScreenPoint,
  b1: ScreenPoint,
  b2: ScreenPoint,
): ScreenPoint {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) <= MIN_DISTANCE_EPSILON) {
    return { x: a2.x, y: a2.y };
  }
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function buildShadowCoverageRegionForTest(
  origin: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
  viewportCorners: readonly ScreenPoint[],
): ScreenPoint[] {
  return getShadowCoverageRegion(viewportCorners, origin, a, b);
}

export function pointInScreenPolygonForTest(
  point: ScreenPoint,
  polygon: readonly ScreenPoint[],
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
