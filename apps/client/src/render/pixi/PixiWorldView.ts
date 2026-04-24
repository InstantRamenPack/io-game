import { Graphics, type Application, type Container } from "pixi.js";
import { drawRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import {
  PixiPlacementPreview,
  type PlacementPreviewState,
} from "@client/render/pixi/PixiPlacementPreview.ts";
import { PixiSceneGraph } from "@client/render/pixi/PixiSceneGraph.ts";
import { PixiViewportController } from "@client/render/pixi/PixiViewportController.ts";
import { PixiCullingController } from "@client/render/pixi/PixiCullingController.ts";
import type { WorldSize } from "@client/render/renderTypes.ts";

const GRID_CELL_SIZE = 100;
const HOME_BASE_WIDTH = 1600;
const HOME_BASE_HEIGHT = 1200;
const HOME_BASE_OUTER_COLOR = 0xc1c8d3;
const HOME_BASE_INNER_COLOR = 0x8f99a8;
const HOME_BASE_ACCENT_COLOR = 0xe4e9f1;
const HOME_BASE_SHADOW_COLOR = 0x5c6470;
const GRID_DAY_FILL_COLOR = 0xd7f3d2;
const GRID_NIGHT_FILL_COLOR = 0x3f5f46;
const GRID_DAY_LINE_COLOR = 0x2d4f37;
const GRID_NIGHT_LINE_COLOR = 0x9fd69a;
const SNIPER_AIM_LINE_COLOR = 0xff2d2d;
const SNIPER_AIM_LINE_ALPHA = 0.35;
const SNIPER_AIM_LINE_WIDTH = 2;

export class PixiWorldView {
  private readonly sceneGraph = new PixiSceneGraph();
  private readonly viewportController: PixiViewportController;
  private readonly cullingController = new PixiCullingController();
  private readonly placementPreview = new PixiPlacementPreview();
  private readonly sniperAimGuide = new Graphics();
  private worldSize: WorldSize;
  private gridNightBlend = 0;

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
    this.viewportController = new PixiViewportController(worldSize);
    this.sniperAimGuide.visible = false;
    this.sceneGraph.placementLayer.addChild(this.sniperAimGuide);
  }

  public get entityContainer(): Container {
    return this.sceneGraph.entityLayer;
  }

  public get hudContainer(): Container {
    return this.sceneGraph.hudLayer;
  }

  public get effectContainer(): Container {
    return this.sceneGraph.effectLayer;
  }

  public get overlayContainer(): Container {
    return this.sceneGraph.overlayLayer;
  }

  public get worldRoot(): Container {
    return this.sceneGraph.worldRoot;
  }

  public attach(app: Application): void {
    this.sceneGraph.attach(app);
    this.placementPreview.attach(this.sceneGraph.placementLayer);
    this.cullingController.configure({
      worldRoot: this.sceneGraph.worldRoot,
      entityLayer: this.sceneGraph.entityLayer,
      effectLayer: this.sceneGraph.effectLayer,
      placementLayer: this.sceneGraph.placementLayer,
      hudRoot: this.sceneGraph.hudRoot,
      worldSize: this.worldSize,
    });
    this.drawGridGeometry();
    this.viewportController.sync(app, this.sceneGraph.worldRoot);
    this.syncCullViewport(app);
  }

  public setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.viewportController.setWorldSize(this.worldSize);
    this.cullingController.updateWorldSize(this.worldSize);
    this.drawGridGeometry();
  }

  public update(
    deltaMs: number,
    app: Application,
    swimOffset: { x: number; y: number },
  ): void {
    this.viewportController.setSwimOffset(swimOffset.x, swimOffset.y);
    this.viewportController.update(deltaMs, app, this.sceneGraph.worldRoot);
    this.syncCullViewport(app);
    this.redrawScreenGridLines(app);
  }

  public setGridNightBlend(blend: number): void {
    this.gridNightBlend = Math.max(0, Math.min(1, blend));
    this.updateGridColors();
  }

  public setCameraToPlayer(
    app: Application | null,
    x: number,
    y: number,
  ): void {
    this.viewportController.setCameraTarget(x, y);
    if (!app) {
      return;
    }
    this.viewportController.sync(app, this.sceneGraph.worldRoot);
    this.syncCullViewport(app);
  }

  public screenToWorld(
    app: Application | null,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!app) {
      return { x: clientX, y: clientY };
    }
    return this.viewportController.screenToWorld(
      app,
      this.sceneGraph.worldRoot,
      clientX,
      clientY,
    );
  }

  public getViewportCenterWorld(
    app: Application | null,
  ): { x: number; y: number } | null {
    if (!app) {
      return null;
    }

    const centerClient = this.viewportController.getCanvasCenterClient(app);
    return this.viewportController.screenToWorld(
      app,
      this.sceneGraph.worldRoot,
      centerClient.x,
      centerClient.y,
    );
  }

  public clientToScreen(
    app: Application | null,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!app) {
      return { x: clientX, y: clientY };
    }
    return this.viewportController.clientToScreen(app, clientX, clientY);
  }

  public invalidateViewRectCache(): void {
    this.viewportController.invalidateViewRectCache();
  }

  public setPlacementPreview(state: PlacementPreviewState | null): void {
    this.placementPreview.sync(state);
  }

  public setSniperAimGuide(
    state: {
      originX: number;
      originY: number;
      directionX: number;
      directionY: number;
    } | null,
  ): void {
    if (!state) {
      this.sniperAimGuide.clear();
      this.sniperAimGuide.visible = false;
      return;
    }

    const endpoint = clipRayToWorldBounds(
      state.originX,
      state.originY,
      state.directionX,
      state.directionY,
      this.worldSize,
    );
    if (!endpoint) {
      this.sniperAimGuide.clear();
      this.sniperAimGuide.visible = false;
      return;
    }

    this.sniperAimGuide.clear();
    this.sniperAimGuide
      .moveTo(state.originX, state.originY)
      .lineTo(endpoint.x, endpoint.y)
      .stroke({
        width: SNIPER_AIM_LINE_WIDTH,
        color: SNIPER_AIM_LINE_COLOR,
        alpha: SNIPER_AIM_LINE_ALPHA,
      });
    this.sniperAimGuide.visible = true;
  }

  private drawGridGeometry(): void {
    const bgGraphic = this.sceneGraph.gridBackgroundGraphic;
    const landmarkGraphic = this.sceneGraph.landmarkGraphic;
    const { w, h } = this.worldSize;
    const baseWidth = Math.min(HOME_BASE_WIDTH, Math.max(800, w * 0.6));
    const baseHeight = Math.min(HOME_BASE_HEIGHT, Math.max(600, h * 0.5));
    const baseX = (w - baseWidth) / 2;
    const baseY = (h - baseHeight) / 2;
    const inset = Math.max(80, Math.min(baseWidth, baseHeight) * 0.08);
    const centerBandHeight = Math.max(160, baseHeight * 0.16);
    const centerBandY = baseY + (baseHeight - centerBandHeight) / 2;

    bgGraphic.clear();
    landmarkGraphic.clear();

    drawRect(bgGraphic, 0, 0, w, h, { color: 0xffffff, alpha: 1 });

    // Zone backgrounds
    landmarkGraphic.rect(300, 300, 2400, 2400).fill({ color: 0x8b3a3a, alpha: 0.1 });
    landmarkGraphic.rect(350, 3300, 1450, 1500).fill({ color: 0x3a5f8b, alpha: 0.13 });
    landmarkGraphic.rect(3200, 250, 3300, 2250).fill({ color: 0x8b7a3a, alpha: 0.1 });
    landmarkGraphic.rect(3200, 4800, 2900, 1900).fill({ color: 0x8b5a2a, alpha: 0.1 });
    landmarkGraphic.rect(7000, 200, 2800, 6600).fill({ color: 0x2a5a2a, alpha: 0.13 });

    // Helipad at extraction zone center (1000, 4050)
    const hx = 1000;
    const hy = 4050;
    const hr = 130;
    landmarkGraphic
      .circle(hx, hy, hr)
      .fill({ color: 0xddcc44, alpha: 0.55 })
      .stroke({ width: 6, color: 0xaa9920, alpha: 0.9 });
    landmarkGraphic
      .circle(hx, hy, hr * 0.82)
      .stroke({ width: 3, color: 0xaa9920, alpha: 0.7 });
    // H shape inside helipad
    const hBarW = hr * 0.18;
    const hBarH = hr * 0.75;
    const hCrossH = hr * 0.15;
    const hCrossW = hr * 0.46;
    landmarkGraphic
      .rect(hx - hCrossW / 2 - hBarW, hy - hBarH / 2, hBarW, hBarH)
      .fill({ color: 0x6b5500, alpha: 0.85 });
    landmarkGraphic
      .rect(hx + hCrossW / 2, hy - hBarH / 2, hBarW, hBarH)
      .fill({ color: 0x6b5500, alpha: 0.85 });
    landmarkGraphic
      .rect(hx - hCrossW / 2 - hBarW, hy - hCrossH / 2, hCrossW + hBarW * 2, hCrossH)
      .fill({ color: 0x6b5500, alpha: 0.85 });

    landmarkGraphic
      .roundRect(baseX, baseY, baseWidth, baseHeight, 16)
      .fill({ color: HOME_BASE_OUTER_COLOR, alpha: 0.92 })
      .stroke({ width: 18, color: HOME_BASE_SHADOW_COLOR, alpha: 0.9 });
    landmarkGraphic
      .roundRect(
        baseX + inset,
        baseY + inset,
        baseWidth - inset * 2,
        baseHeight - inset * 2,
        12,
      )
      .fill({ color: HOME_BASE_INNER_COLOR, alpha: 0.72 })
      .stroke({ width: 6, color: HOME_BASE_ACCENT_COLOR, alpha: 0.6 });
    landmarkGraphic
      .rect(
        baseX + inset * 0.8,
        centerBandY,
        baseWidth - inset * 1.6,
        centerBandHeight,
      )
      .fill({ color: HOME_BASE_ACCENT_COLOR, alpha: 0.2 });

    this.sceneGraph.updateGridCache();
    this.updateGridColors();
  }

  private updateGridColors(): void {
    const bgGraphic = this.sceneGraph.gridBackgroundGraphic;
    const lineGraphic = this.sceneGraph.gridLinesGraphic;
    bgGraphic.tint = lerpColor(
      GRID_DAY_FILL_COLOR,
      GRID_NIGHT_FILL_COLOR,
      this.gridNightBlend,
    );
    lineGraphic.tint = lerpColor(
      GRID_DAY_LINE_COLOR,
      GRID_NIGHT_LINE_COLOR,
      applyContrastLag(this.gridNightBlend),
    );
    const lineVisibility = Math.min(
      1,
      Math.max(0, 2 * Math.abs(this.gridNightBlend - 0.5)),
    );
    lineGraphic.alpha = 0.4 * lineVisibility;
  }

  private redrawScreenGridLines(app: Application): void {
    const g = this.sceneGraph.gridLinesGraphic;
    const { x: camX, y: camY } = this.viewportController.getCameraPosition();
    const scale = this.viewportController.getCurrentScale(app);
    const cellPx = GRID_CELL_SIZE * scale;
    const sw = app.screen.width;
    const sh = app.screen.height;

    const offX = ((camX % GRID_CELL_SIZE) * scale + cellPx) % cellPx;
    const offY = ((camY % GRID_CELL_SIZE) * scale + cellPx) % cellPx;

    g.clear();
    for (let x = sw / 2 - offX; x >= -cellPx; x -= cellPx) {
      g.moveTo(x, 0).lineTo(x, sh);
    }
    for (let x = sw / 2 - offX + cellPx; x <= sw + cellPx; x += cellPx) {
      g.moveTo(x, 0).lineTo(x, sh);
    }
    for (let y = sh / 2 - offY; y >= -cellPx; y -= cellPx) {
      g.moveTo(0, y).lineTo(sw, y);
    }
    for (let y = sh / 2 - offY + cellPx; y <= sh + cellPx; y += cellPx) {
      g.moveTo(0, y).lineTo(sw, y);
    }
    g.stroke({ width: 1, color: 0xffffff, alpha: 1 });
  }

  private syncCullViewport(app: Application): void {
    const bounds = this.viewportController.getWorldViewportBounds(app);
    this.cullingController.updateViewport(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    );
  }
}

function clipRayToWorldBounds(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  worldSize: WorldSize,
): { x: number; y: number } | null {
  const rayLength = Math.hypot(directionX, directionY);
  if (rayLength <= Number.EPSILON) {
    return null;
  }

  const dx = directionX / rayLength;
  const dy = directionY / rayLength;
  const ts: number[] = [];
  const minX = 0;
  const minY = 0;
  const maxX = worldSize.w;
  const maxY = worldSize.h;

  if (Math.abs(dx) > Number.EPSILON) {
    ts.push((minX - originX) / dx, (maxX - originX) / dx);
  }
  if (Math.abs(dy) > Number.EPSILON) {
    ts.push((minY - originY) / dy, (maxY - originY) / dy);
  }

  let closestT = Number.POSITIVE_INFINITY;
  for (const t of ts) {
    if (!Number.isFinite(t) || t <= 0) {
      continue;
    }
    const x = originX + dx * t;
    const y = originY + dy * t;
    if (
      x < minX - 0.01 ||
      x > maxX + 0.01 ||
      y < minY - 0.01 ||
      y > maxY + 0.01
    ) {
      continue;
    }
    if (t < closestT) {
      closestT = t;
    }
  }

  if (!Number.isFinite(closestT)) {
    return null;
  }

  return {
    x: originX + dx * closestT,
    y: originY + dy * closestT,
  };
}

function lerpColor(start: number, end: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const startR = (start >> 16) & 0xff;
  const startG = (start >> 8) & 0xff;
  const startB = start & 0xff;
  const endR = (end >> 16) & 0xff;
  const endG = (end >> 8) & 0xff;
  const endB = end & 0xff;
  const r = Math.round(startR + (endR - startR) * clamped);
  const g = Math.round(startG + (endG - startG) * clamped);
  const b = Math.round(startB + (endB - startB) * clamped);
  return (r << 16) | (g << 8) | b;
}

function applyContrastLag(blend: number): number {
  const lag = 0.12;
  if (blend >= 0.5) {
    return Math.min(1, blend + lag);
  }
  return Math.max(0, blend - lag);
}
