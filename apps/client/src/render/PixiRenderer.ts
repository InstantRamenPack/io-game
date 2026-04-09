import type { Application, Container, Texture } from "pixi.js";
import type { GameClient } from "@client/client/GameClient.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { PixiHud } from "@client/render/PixiHud.ts";
import { PixiAppHost } from "@client/render/pixi/PixiAppHost.ts";
import { PixiAssetStore } from "@client/render/pixi/PixiAssetStore.ts";
import { PixiCullingController } from "@client/render/pixi/PixiCullingController.ts";
import { drawRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import { PixiOverlayLayer } from "@client/render/pixi/PixiOverlayLayer.ts";
import { PixiParticleLayer } from "@client/render/pixi/PixiParticleLayer.ts";
import {
  PixiPlacementPreview,
  type PlacementPreviewState,
} from "@client/render/pixi/PixiPlacementPreview.ts";
import { PixiRenderScheduler } from "@client/render/pixi/PixiRenderScheduler.ts";
import { PixiSceneGraph } from "@client/render/pixi/PixiSceneGraph.ts";
import { PixiViewportController } from "@client/render/pixi/PixiViewportController.ts";
import type { ExplosionStyle } from "@shared/net/events.ts";

type WorldSize = { w: number; h: number };

/**
 * Rendering facade for visible entity state.
 * Internal responsibilities are delegated to dedicated Pixi helpers so this
 * class remains the public integration surface for the rest of the client.
 */
export class PixiRenderer {
  private readonly appHost = new PixiAppHost();
  private readonly sceneGraph = new PixiSceneGraph();
  private readonly assetStore = new PixiAssetStore();
  private readonly viewportController: PixiViewportController;
  private readonly cullingController = new PixiCullingController();
  private readonly particleLayer = new PixiParticleLayer();
  private readonly overlayLayer = new PixiOverlayLayer();
  private readonly renderScheduler = new PixiRenderScheduler();
  private readonly placementPreview = new PixiPlacementPreview();

  private hud: PixiHud | null = null;
  private readonly gridCellSize = 100;
  private gridNightBlend = 0;
  private readonly gridDayFillColor = 0xd7f3d2;
  private readonly gridNightFillColor = 0x3f5f46;
  private readonly gridDayLineColor = 0x2d4f37;
  private readonly gridNightLineColor = 0x9fd69a;
  private worldSize: WorldSize;
  private tickRate = 20;

  public playerEntityId?: number;

  private readonly handleResize = (): void => {
    const app = this.app;
    if (!app) {
      return;
    }

    this.appHost.resize(this.getRendererResolution());
    this.overlayLayer.resize(app);
    this.viewportController.sync(app, this.sceneGraph.worldRoot);
    this.renderScene(true);
  };

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
    this.viewportController = new PixiViewportController(worldSize);
  }

  public get entityContainer(): Container | null {
    return this.sceneGraph.entityLayer;
  }

  public get app(): Application | null {
    try {
      return this.appHost.getApp();
    } catch {
      return null;
    }
  }

  public createHud(options: {
    gameClient: GameClient;
    selectors: GameSelectors;
  }): PixiHud {
    if (!this.hud) {
      this.hud = new PixiHud(options);
    }

    if (this.app) {
      this.hud.attach(this.sceneGraph.hudLayer);
    }

    this.renderScheduler.markDirty();
    return this.hud;
  }

  public setPlayerEntityId(entityId: number | undefined): void {
    this.playerEntityId = entityId;
    if (entityId === undefined) {
      this.viewportController.reset();
    }
  }

  public setTickRate(tickRate: number): void {
    if (Number.isFinite(tickRate) && tickRate > 0) {
      this.tickRate = Math.floor(tickRate);
    }
  }

  public getTickRate(): number {
    return this.tickRate;
  }

  public async init(
    hostElement: HTMLElement,
    worldSize: WorldSize,
  ): Promise<void> {
    this.worldSize = { ...worldSize };
    this.viewportController.setWorldSize(this.worldSize);

    const app = await this.appHost.attach(hostElement, {
      backgroundColor: 0xd7f3d2,
      antialias: true,
      autoDensity: true,
      autoStart: false,
      resolution: this.getRendererResolution(),
    });

    window.app = app;
    window.removeEventListener("resize", this.handleResize);
    window.addEventListener("resize", this.handleResize);

    await this.assetStore.load(app);
    this.sceneGraph.attach(app);
    this.particleLayer.attach(this.sceneGraph.effectLayer);
    this.particleLayer.setTextures({
      softCircle: this.assetStore.getParticleTexture("soft-circle"),
      ring: this.assetStore.getParticleTexture("ring"),
    });
    this.overlayLayer.attach(this.sceneGraph.overlayLayer);
    this.overlayLayer.resize(app);
    this.placementPreview.attach(this.sceneGraph.placementLayer);

    if (this.hud) {
      this.hud.attach(this.sceneGraph.hudLayer);
    }

    this.cullingController.configure({
      worldRoot: this.sceneGraph.worldRoot,
      entityLayer: this.sceneGraph.entityLayer,
      effectLayer: this.sceneGraph.effectLayer,
      placementLayer: this.sceneGraph.placementLayer,
      hudRoot: this.sceneGraph.hudRoot,
      worldSize: this.worldSize,
    });
    this.drawGridGeometry();
    this.applyWorldFilters();
    this.viewportController.sync(app, this.sceneGraph.worldRoot);
    this.renderScene(true);
  }

  public async attach(
    hostElement: HTMLElement,
    worldSize: WorldSize,
  ): Promise<void> {
    await this.init(hostElement, worldSize);
  }

  public getItemTexture(typeId: string): Texture {
    return this.assetStore.getItemTexture(typeId);
  }

  public getItemSpriteTexture(typeId: string): Texture {
    return this.assetStore.getItemSpriteTexture(typeId);
  }

  public setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.viewportController.setWorldSize(this.worldSize);
    this.cullingController.updateWorldSize(this.worldSize);
    this.drawGridGeometry();
    this.renderScene(true);
  }

  public update(deltaMs: number): void {
    const app = this.app;
    if (!app) {
      return;
    }

    this.particleLayer.update(deltaMs);
    this.overlayLayer.update(app, deltaMs);
    const swimOffset = this.overlayLayer.getSwimOffset();
    this.viewportController.setSwimOffset(swimOffset.x, swimOffset.y);
    this.viewportController.update(deltaMs, app, this.sceneGraph.worldRoot);
    this.applyWorldFilters();
    this.renderScheduler.markDirty();
    this.renderScene();
  }

  public setGridNightBlend(blend: number): void {
    const nextBlend = Math.max(0, Math.min(1, blend));
    if (this.gridNightBlend === nextBlend) {
      return;
    }
    this.gridNightBlend = nextBlend;
    this.updateGridColors();
    this.renderScheduler.markDirty();
  }

  public setCameraToPlayer(x: number, y: number): void {
    this.viewportController.setCameraTarget(x, y);
    if (this.app) {
      this.viewportController.sync(this.app, this.sceneGraph.worldRoot);
    }
    this.renderScheduler.markDirty();
  }

  public screenToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const app = this.app;
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

  public clientToScreen(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const app = this.app;
    if (!app) {
      return { x: clientX, y: clientY };
    }
    return this.viewportController.clientToScreen(app, clientX, clientY);
  }

  public getView(): HTMLCanvasElement | null {
    return this.appHost.getCanvas();
  }

  public triggerDamageOverlay(durationMs = 200): void {
    this.overlayLayer.triggerDamageOverlay(durationMs);
    this.renderScheduler.markDirty();
  }

  public setPlacementPreview(state: PlacementPreviewState | null): void {
    this.placementPreview.sync(state);
    this.renderScheduler.markDirty();
  }

  public triggerExplosionEffect(
    x: number,
    y: number,
    radius: number,
    style: ExplosionStyle,
  ): void {
    this.particleLayer.triggerExplosion(x, y, radius, style);
    this.renderScheduler.markDirty();
  }

  public setConfusionState(active: boolean, intensityRatio: number): void {
    this.overlayLayer.setConfusionState(active, intensityRatio);
    this.applyWorldFilters();
    this.renderScheduler.markDirty();
  }

  private renderScene(force = false): void {
    const app = this.app;
    if (!app) {
      return;
    }
    this.renderScheduler.render(app, this.hud, force);
  }

  private drawGridGeometry(): void {
    const bgGraphic = this.sceneGraph.gridBackgroundGraphic;
    const lineGraphic = this.sceneGraph.gridLinesGraphic;
    const { w, h } = this.worldSize;
    const cell = Math.max(10, Math.floor(this.gridCellSize));

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
    const fillColor = lerpColor(
      this.gridDayFillColor,
      this.gridNightFillColor,
      this.gridNightBlend,
    );
    const lineColor = lerpColor(
      this.gridDayLineColor,
      this.gridNightLineColor,
      applyContrastLag(this.gridNightBlend),
    );

    bgGraphic.tint = fillColor;
    lineGraphic.tint = lineColor;
    const lineVisibility = Math.min(
      1,
      Math.max(0, 2 * Math.abs(this.gridNightBlend - 0.5)),
    );
    lineGraphic.alpha = 0.4 * lineVisibility;
  }

  private applyWorldFilters(): void {
    const filter = this.overlayLayer.getWorldFilter();
    this.sceneGraph.worldRoot.filters = filter ? [filter] : null;
  }

  private getRendererResolution(): number {
    return Math.max(1, window.devicePixelRatio || 1);
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

declare global {
  interface Window {
    app: Application;
  }
}
