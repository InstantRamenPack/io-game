import type { Application, Container, Texture } from "pixi.js";
import type { GameClientHudApi } from "@client/client/clientTypes.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { PixiHud } from "@client/render/PixiHud.ts";
import { PixiAppHost } from "@client/render/pixi/PixiAppHost.ts";
import { PixiAssetStore } from "@client/render/pixi/PixiAssetStore.ts";
import { PixiEffectSystem } from "@client/render/pixi/PixiEffectSystem.ts";
import { PixiRenderScheduler } from "@client/render/pixi/PixiRenderScheduler.ts";
import { type PlacementPreviewState } from "@client/render/pixi/PixiPlacementPreview.ts";
import { PixiWorldView } from "@client/render/pixi/PixiWorldView.ts";
import type { WorldSize } from "@client/render/renderTypes.ts";
import type { ExplosionStyle } from "@shared/net/events.ts";
import type {
  ExtractionSnapshot,
  InfrastructureSnapshot,
  MapSnapshot,
} from "@shared/net/snapshots.ts";

/**
 * Rendering facade for visible entity state.
 * Internal responsibilities are delegated to dedicated Pixi helpers so this
 * class remains the public integration surface for the rest of the client.
 */
export class PixiRenderer {
  private readonly appHost = new PixiAppHost();
  private readonly assetStore = new PixiAssetStore();
  private readonly worldView: PixiWorldView;
  private readonly effectSystem = new PixiEffectSystem();
  private readonly renderScheduler = new PixiRenderScheduler();

  private hud: PixiHud | null = null;
  private worldSize: WorldSize;
  private tickRate = 20;

  public playerEntityId?: number;
  public playerX: number | undefined = undefined;
  public playerY: number | undefined = undefined;

  private readonly handleResize = (): void => {
    const app = this.app;
    if (!app) {
      return;
    }

    this.appHost.resize(this.getRendererResolution());
    this.effectSystem.resize(app);
    this.worldView.invalidateViewRectCache();
    this.worldView.attach(app);
    this.renderScene(true);
  };

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
    this.worldView = new PixiWorldView(worldSize);
  }

  public get entityContainer(): Container | null {
    return this.worldView.entityContainer;
  }

  public get app(): Application | null {
    return this.appHost.getAppIfReady();
  }

  public createHud(options: {
    gameClient: GameClientHudApi;
    selectors: GameSelectors;
  }): PixiHud {
    if (!this.hud) {
      this.hud = new PixiHud(options);
    }

    if (this.app) {
      this.hud.attach(this.worldView.hudContainer);
    }

    this.renderScheduler.markDirty();
    return this.hud;
  }

  public setPlayerEntityId(entityId: number | undefined): void {
    this.playerEntityId = entityId;
    if (entityId === undefined) {
      this.worldView.updatePlayerVisibility(null);
      this.worldView.invalidateViewRectCache();
      this.worldView.resetCamera();
    }
  }

  public setPlayerPosition(x: number, y: number): void {
    this.playerX = x;
    this.playerY = y;
    this.worldView.updatePlayerVisibility({ x, y });
    this.renderScheduler.markDirty();
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
    this.worldView.setWorldSize(this.worldSize);

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
    this.worldView.attach(app);
    this.effectSystem.attach({
      effectContainer: this.worldView.effectContainer,
      overlayContainer: this.worldView.overlayContainer,
    });
    this.effectSystem.setTextures({
      softCircle: this.assetStore.getParticleTexture("soft-circle"),
      ring: this.assetStore.getParticleTexture("ring"),
    });
    this.effectSystem.resize(app);

    if (this.hud) {
      this.hud.attach(this.worldView.hudContainer);
    }
    this.effectSystem.syncWorldFilters(this.worldView.worldRoot);
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
    this.worldView.setWorldSize(this.worldSize);
    this.renderScene(true);
  }

  public update(deltaMs: number): void {
    const app = this.app;
    if (!app) {
      return;
    }

    const swimOffset = this.effectSystem.update(app, deltaMs);
    this.worldView.update(deltaMs, app, swimOffset);
    this.effectSystem.syncWorldFilters(this.worldView.worldRoot);
    this.renderScheduler.markDirty();
    this.renderScene();
  }

  public setGridNightBlend(blend: number): void {
    const nextBlend = Math.max(0, Math.min(1, blend));
    this.worldView.setGridNightBlend(nextBlend);
    this.renderScheduler.markDirty();
  }

  public setPlaygroundMode(isPlayground: boolean): void {
    this.worldView.setPlaygroundMode(isPlayground);
    this.renderScheduler.markDirty();
  }

  public updateExtractionState(state: ExtractionSnapshot | null): void {
    this.worldView.updateExtractionState(state);
  }

  public updateInfrastructureState(state: InfrastructureSnapshot | null): void {
    this.worldView.updateInfrastructureState(state);
    this.renderScheduler.markDirty();
  }

  public updateMapState(state: MapSnapshot | null): void {
    this.worldView.updateMapState(state);
    this.renderScheduler.markDirty();
  }

  public setCameraToPlayer(x: number, y: number): void {
    this.worldView.setCameraToPlayer(this.app, x, y);
    this.renderScheduler.markDirty();
  }

  public screenToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const app = this.app;
    return this.worldView.screenToWorld(app, clientX, clientY);
  }

  public getViewportCenterWorld(): { x: number; y: number } | null {
    const app = this.app;
    return this.worldView.getViewportCenterWorld(app);
  }

  public getCameraDebugState(): ReturnType<
    PixiWorldView["getCameraDebugState"]
  > {
    return this.worldView.getCameraDebugState(this.app);
  }

  public worldToScreen(
    worldX: number,
    worldY: number,
  ): { x: number; y: number } | null {
    const app = this.app;
    return this.worldView.worldToScreen(app, worldX, worldY);
  }

  public clientToScreen(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const app = this.app;
    return this.worldView.clientToScreen(app, clientX, clientY);
  }

  public getView(): HTMLCanvasElement | null {
    return this.appHost.getCanvas();
  }

  public invalidateViewRectCache(): void {
    this.worldView.invalidateViewRectCache();
  }

  public triggerDamageOverlay(durationMs = 200): void {
    this.effectSystem.triggerDamageOverlay(durationMs);
    this.renderScheduler.markDirty();
  }

  public setPlacementPreview(state: PlacementPreviewState | null): void {
    this.worldView.setPlacementPreview(state);
    this.renderScheduler.markDirty();
  }

  public setSniperAimGuide(
    state: {
      originX: number;
      originY: number;
      directionX: number;
      directionY: number;
    } | null,
  ): void {
    this.worldView.setSniperAimGuide(state);
    this.renderScheduler.markDirty();
  }

  public triggerExplosionEffect(
    x: number,
    y: number,
    radius: number,
    style: ExplosionStyle,
  ): void {
    this.effectSystem.triggerExplosionEffect(x, y, radius, style);
    this.renderScheduler.markDirty();
  }

  public setConfusionState(active: boolean, intensityRatio: number): void {
    this.effectSystem.setConfusionState(active, intensityRatio);
    this.effectSystem.syncWorldFilters(this.worldView.worldRoot);
    this.renderScheduler.markDirty();
  }

  private renderScene(force = false): void {
    const app = this.app;
    if (!app) {
      return;
    }
    this.renderScheduler.render(app, this.hud, force);
  }
  private getRendererResolution(): number {
    return Math.max(1, window.devicePixelRatio || 1);
  }
}

declare global {
  interface Window {
    app: Application;
  }
}
