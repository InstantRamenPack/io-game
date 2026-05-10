import {
  Container,
  Graphics,
  Sprite,
  Texture,
  type Application,
} from "pixi.js";
import type { VisibilityBlockerShape } from "@client/render/renderTypes.ts";
import type { VisibilityContext } from "@shared/world/Visibility.ts";

type ScreenPoint = { x: number; y: number };
type WorldPoint = { x: number; y: number };
type ShadowEdge = readonly [WorldPoint, WorldPoint];
type ScreenQuad = readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
type WorldToScreen = (
  app: Application,
  worldX: number,
  worldY: number,
) => ScreenPoint | null;

const MIN_DISTANCE_EPSILON = 1e-6;
const SCREEN_SHADOW_EXTENSION_RATIO = 2.5;
const LIGHTS_OUT_FADE_START_RADIUS = 480;
const LIGHTS_OUT_FADE_END_RADIUS = 600;
const LIGHTS_OUT_FALLOFF_TEXTURE_SIZE = 512;
const VIGNETTE_TEXTURE_SIZE = 512;
const VIGNETTE_HOLE_RADIUS_RATIO = 0.18;
const VIGNETTE_EDGE_RADIUS_RATIO = 0.48;
const VIGNETTE_ELLIPSE_RATIO = 0.88;
const DARKNESS_OVERLAY_COLOR = 0x000000;
const VIGNETTE_OVERLAY_COLOR = 0x000000;
const VIGNETTE_OVERLAY_ALPHA = 0.3;

export class PixiLightsOutOverlay {
  public readonly container = new Container();
  private readonly darknessOverlay = new Graphics();
  private readonly radiusFalloff = new Sprite(
    createLightsOutRadiusFalloffTexture(),
  );
  private readonly vignette = new Sprite(createLightsOutVignetteTexture());

  constructor() {
    this.container.addChild(
      this.darknessOverlay,
      this.radiusFalloff,
      this.vignette,
    );
    this.radiusFalloff.anchor.set(0.5);
    this.radiusFalloff.visible = false;
    this.vignette.tint = VIGNETTE_OVERLAY_COLOR;
    this.vignette.alpha = VIGNETTE_OVERLAY_ALPHA;
  }

  public update(
    app: Application,
    visibility: VisibilityContext | null,
    blockers: readonly VisibilityBlockerShape[],
    worldToScreen: WorldToScreen,
  ): void {
    const g = this.darknessOverlay;
    g.clear();

    if (!visibility?.restricted) {
      g.visible = false;
      this.radiusFalloff.visible = false;
      this.vignette.visible = false;
      return;
    }

    g.visible = true;
    this.radiusFalloff.visible = true;
    this.vignette.visible = true;
    const sw = app.screen.width;
    const sh = app.screen.height;
    const visibleRadius = getVisibilityRadiusScreen(
      app,
      visibility,
      worldToScreen,
    );
    if (!visibleRadius) {
      this.radiusFalloff.visible = false;
      return;
    }

    g.rect(0, 0, sw, sh).fill({ color: DARKNESS_OVERLAY_COLOR, alpha: 1 });
    g.circle(visibleRadius.x, visibleRadius.y, visibleRadius.radius).cut();
    this.updateRadiusFalloff(visibleRadius);
    drawVisibilityBlockerShadows(app, g, visibility, blockers, worldToScreen);
    this.drawVignette(app);
  }

  private updateRadiusFalloff(visibleRadius: {
    x: number;
    y: number;
    radius: number;
  }): void {
    this.radiusFalloff.position.set(visibleRadius.x, visibleRadius.y);
    this.radiusFalloff.width = visibleRadius.radius * 2;
    this.radiusFalloff.height = visibleRadius.radius * 2;
  }

  private drawVignette(app: Application): void {
    this.vignette.width = app.screen.width;
    this.vignette.height = app.screen.height;
  }
}

function getVisibilityRadiusScreen(
  app: Application,
  visibility: VisibilityContext,
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
  graphic: Graphics,
  visibility: VisibilityContext,
  blockers: readonly VisibilityBlockerShape[],
  worldToScreen: WorldToScreen,
): void {
  const origin = worldToScreen(app, visibility.center.x, visibility.center.y);
  if (!origin) {
    return;
  }
  const shadowExtension =
    Math.hypot(app.screen.width, app.screen.height) *
    SCREEN_SHADOW_EXTENSION_RATIO;

  for (const blocker of blockers) {
    const shadowEdge =
      blocker.kind === "rect"
        ? buildRectBlockerShadow(visibility, blocker)
        : buildCircleBlockerShadow(visibility, blocker);
    if (!shadowEdge) {
      continue;
    }
    const left = worldToScreen(app, shadowEdge[0].x, shadowEdge[0].y);
    const right = worldToScreen(app, shadowEdge[1].x, shadowEdge[1].y);
    if (!left || !right) {
      continue;
    }
    drawShadowMinusBlocker(
      app,
      graphic,
      blocker,
      [
        left,
        extendScreenPointFromOrigin(origin, left, shadowExtension),
        extendScreenPointFromOrigin(origin, right, shadowExtension),
        right,
      ],
      worldToScreen,
    );
  }
}

function drawShadowMinusBlocker(
  app: Application,
  graphic: Graphics,
  blocker: VisibilityBlockerShape,
  shadow: ScreenQuad,
  worldToScreen: WorldToScreen,
): void {
  graphic.poly(toFlatPointBuffer(shadow)).fill({
    color: DARKNESS_OVERLAY_COLOR,
    alpha: 1,
  });
  cutVisibilityBlockerFromShadow(app, graphic, blocker, worldToScreen);
}

function extendScreenPointFromOrigin(
  origin: ScreenPoint,
  point: ScreenPoint,
  distance: number,
): ScreenPoint {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= MIN_DISTANCE_EPSILON) {
    return { ...point };
  }
  return {
    x: origin.x + (dx / length) * distance,
    y: origin.y + (dy / length) * distance,
  };
}

function cutVisibilityBlockerFromShadow(
  app: Application,
  graphic: Graphics,
  blocker: VisibilityBlockerShape,
  worldToScreen: WorldToScreen,
): void {
  if (blocker.kind === "rect") {
    const corners = [
      worldToScreen(app, blocker.minX, blocker.minY),
      worldToScreen(app, blocker.maxX, blocker.minY),
      worldToScreen(app, blocker.maxX, blocker.maxY),
      worldToScreen(app, blocker.minX, blocker.maxY),
    ];
    if (corners.some((corner) => corner === null)) {
      return;
    }
    graphic.poly(toFlatPointBuffer(corners)).cut();
    return;
  }

  const center = worldToScreen(app, blocker.centerX, blocker.centerY);
  const edgeX = worldToScreen(
    app,
    blocker.centerX + blocker.radius,
    blocker.centerY,
  );
  const edgeY = worldToScreen(
    app,
    blocker.centerX,
    blocker.centerY + blocker.radius,
  );
  if (!center || !edgeX || !edgeY) {
    return;
  }
  graphic
    .ellipse(
      center.x,
      center.y,
      Math.abs(edgeX.x - center.x),
      Math.abs(edgeY.y - center.y),
    )
    .cut();
}

function buildRectBlockerShadow(
  visibility: VisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "rect" }>,
): ShadowEdge | null {
  const origin = visibility.center;
  const blockerCenter = {
    x: (blocker.minX + blocker.maxX) / 2,
    y: (blocker.minY + blocker.maxY) / 2,
  };
  const distanceToBlocker = Math.hypot(
    blockerCenter.x - origin.x,
    blockerCenter.y - origin.y,
  );
  if (distanceToBlocker > visibility.radius || distanceToBlocker <= 0) {
    return null;
  }
  const baseAngle = Math.atan2(
    blockerCenter.y - origin.y,
    blockerCenter.x - origin.x,
  );
  const silhouette = [
    { x: blocker.minX, y: blocker.minY },
    { x: blocker.maxX, y: blocker.minY },
    { x: blocker.maxX, y: blocker.maxY },
    { x: blocker.minX, y: blocker.maxY },
  ]
    .map((point) => ({
      point,
      offset: unwrapAngle(
        Math.atan2(point.y - origin.y, point.x - origin.x),
        baseAngle,
      ),
    }))
    .sort((left, right) => left.offset - right.offset);
  const left = silhouette[0]?.point;
  const right = silhouette.at(-1)?.point;
  if (!left || !right) {
    return null;
  }
  return [left, right];
}

function buildCircleBlockerShadow(
  visibility: VisibilityContext,
  blocker: Extract<VisibilityBlockerShape, { kind: "circle" }>,
): ShadowEdge | null {
  const origin = visibility.center;
  const dx = blocker.centerX - origin.x;
  const dy = blocker.centerY - origin.y;
  const distance = Math.hypot(dx, dy);
  if (
    distance > visibility.radius ||
    distance <= blocker.radius + MIN_DISTANCE_EPSILON
  ) {
    return null;
  }
  const centerAngle = Math.atan2(dy, dx);
  const tangentOffset = Math.acos(
    Math.min(1, blocker.radius / Math.max(distance, MIN_DISTANCE_EPSILON)),
  );
  const left = {
    x:
      blocker.centerX +
      Math.cos(centerAngle + Math.PI - tangentOffset) * blocker.radius,
    y:
      blocker.centerY +
      Math.sin(centerAngle + Math.PI - tangentOffset) * blocker.radius,
  };
  const right = {
    x:
      blocker.centerX +
      Math.cos(centerAngle + Math.PI + tangentOffset) * blocker.radius,
    y:
      blocker.centerY +
      Math.sin(centerAngle + Math.PI + tangentOffset) * blocker.radius,
  };
  return [left, right];
}

function toFlatPointBuffer(points: readonly (ScreenPoint | null)[]): number[] {
  const buffer: number[] = [];
  for (const point of points) {
    if (!point) {
      continue;
    }
    buffer.push(point.x, point.y);
  }
  return buffer;
}

function unwrapAngle(angle: number, center: number): number {
  let unwrapped = angle;
  while (unwrapped - center > Math.PI) {
    unwrapped -= Math.PI * 2;
  }
  while (unwrapped - center < -Math.PI) {
    unwrapped += Math.PI * 2;
  }
  return unwrapped;
}

function smootherstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function createLightsOutRadiusFalloffTexture(): Texture {
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
  const fadeStartRatio =
    LIGHTS_OUT_FADE_START_RADIUS / LIGHTS_OUT_FADE_END_RADIUS;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distanceRatio = Math.hypot(dx, dy) / outerRadius;
      const fadeRatio = (distanceRatio - fadeStartRatio) / (1 - fadeStartRatio);
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

function createLightsOutVignetteTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = VIGNETTE_TEXTURE_SIZE;
  canvas.height = VIGNETTE_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return Texture.EMPTY;
  }

  const image = context.createImageData(canvas.width, canvas.height);
  const center = (VIGNETTE_TEXTURE_SIZE - 1) / 2;
  const innerRadius = VIGNETTE_TEXTURE_SIZE * VIGNETTE_HOLE_RADIUS_RATIO;
  const outerRadius = VIGNETTE_TEXTURE_SIZE * VIGNETTE_EDGE_RADIUS_RATIO;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = x - center;
      const dy = (y - center) / VIGNETTE_ELLIPSE_RATIO;
      const distance = Math.hypot(dx, dy);
      const fadeRatio = (distance - innerRadius) / (outerRadius - innerRadius);
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
