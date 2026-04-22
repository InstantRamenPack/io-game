import type { Application, Container } from "pixi.js";
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
const GRID_DAY_FILL_COLOR = 0xd7f3d2;
const GRID_NIGHT_FILL_COLOR = 0x3f5f46;
const GRID_DAY_LINE_COLOR = 0x2d4f37;
const GRID_NIGHT_LINE_COLOR = 0x9fd69a;

export class PixiWorldView {
  private readonly sceneGraph = new PixiSceneGraph();
  private readonly viewportController: PixiViewportController;
  private readonly cullingController = new PixiCullingController();
  private readonly placementPreview = new PixiPlacementPreview();
  private worldSize: WorldSize;
  private gridNightBlend = 0;

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
    this.viewportController = new PixiViewportController(worldSize);
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

  private drawGridGeometry(): void {
    const bgGraphic = this.sceneGraph.gridBackgroundGraphic;
    const lineGraphic = this.sceneGraph.gridLinesGraphic;
    const { w, h } = this.worldSize;
    const cell = Math.max(10, Math.floor(GRID_CELL_SIZE));

    bgGraphic.clear();
    lineGraphic.clear();

    drawRect(bgGraphic, 0, 0, w, h, { color: 0xffffff, alpha: 1 });

    for (let x = 0; x <= w; x += cell) {
      lineGraphic.moveTo(x, 0).lineTo(x, h);
    }
    for (let y = 0; y <= h; y += cell) {
      lineGraphic.moveTo(0, y).lineTo(w, y);
    }
    lineGraphic.stroke({
      width: 1,
      color: 0xffffff,
      alpha: 1,
    });
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
