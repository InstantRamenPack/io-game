import * as PIXI from "pixijs";
import { ColorMatrixFilter } from "pixijs";
import type { GameClient } from "@client/client/GameClient.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { PixiHud } from "@client/render/PixiHud.ts";
import type { ExplosionStyle } from "@shared/net/events.ts";

type WorldSize = { w: number; h: number };

type ExplosionEffect = {
  graphic: PIXI.Graphics;
  remainingMs: number;
  durationMs: number;
  radius: number;
  x: number;
  y: number;
  style: ExplosionStyle;
};

/**
 * Rendering adapter for visible entity state.
 * Owns the Pixi scene lifecycle and exposes the shared entity layer consumed
 * by dedicated entity renderer classes.
 */
export class PixiRenderer {
  private static readonly CAMERA_FOLLOW_SMOOTHING_MS = 120;

  private app: PIXI.Application<HTMLCanvasElement> | null = null;
  private world: PIXI.Container | null = null;
  private grid: PIXI.Graphics | null = null;
  private effectContainer: PIXI.Container | null = null;
  public entityContainer: PIXI.Container | null = null;
  private damageOverlay: PIXI.Graphics | null = null;
  private hud: PixiHud | null = null;
  private damageOverlayRemainingMs = 0;
  private damageOverlayDurationMs = 200;
  private confusionActive = false;
  private confusionIntensity = 0;
  private confusionTimeMs = 0;
  private confusionSwimX = 0;
  private confusionSwimY = 0;
  private confusionColorFilter: ColorMatrixFilter | null = null;
  private confusionFlash: PIXI.Graphics | null = null;
  private confusionEdge: PIXI.Graphics | null = null;
  private confusionBloom: PIXI.Graphics | null = null;
  private explosionEffects: ExplosionEffect[] = [];
  private itemTextures = new Map<string, PIXI.Texture>();
  private placeholderItemTexture: PIXI.Texture | null = null;
  private itemIconMap: Record<string, string> = {};
  private gridCellSize = 100;
  private gridNightBlend = 0;
  private readonly gridDayFillColor = 0xd7f3d2;
  private readonly gridNightFillColor = 0x3f5f46;
  private readonly gridDayLineColor = 0x2d4f37;
  private readonly gridNightLineColor = 0x9fd69a;
  private worldSize: WorldSize;
  private hostElement: HTMLElement | null = null;
  private cameraPivotX = 0;
  private cameraPivotY = 0;
  private cameraTargetX = 0;
  private cameraTargetY = 0;
  private cameraInitialized = false;

  public playerEntityId?: number;

  private readonly handleResize = (): void => {
    if (!this.app) {
      return;
    }
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.drawDamageOverlay();
    this.syncCameraTransform();
    this.renderScene();
  };

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
  }

  public createHud(options: {
    gameClient: GameClient;
    selectors: GameSelectors;
  }): PixiHud {
    if (!this.hud) {
      this.hud = new PixiHud(options);
    }

    if (this.app) {
      this.hud.attach(this.app);
      this.ensureDamageOverlay();
    }

    return this.hud;
  }

  public setPlayerEntityId(entityId: number | undefined): void {
    this.playerEntityId = entityId;
    if (entityId === undefined) {
      this.cameraInitialized = false;
    }
  }

  public async init(
    hostElement: HTMLElement,
    worldSize: WorldSize,
  ): Promise<void> {
    await this.attach(hostElement, worldSize);

    if (!this.app) {
      throw new Error("Pixi App not created");
    }

    window.app = this.app;
    await this.loadPixiTextures();

    if (!this.world) {
      this.world = new PIXI.Container();
    }
    this.ensureGrid();
    this.app.stage.addChild(this.world);

    if (!this.entityContainer) {
      this.entityContainer = new PIXI.Container();
    }
    if (!this.effectContainer) {
      this.effectContainer = new PIXI.Container();
    }
    this.world.addChild(this.effectContainer);
    this.world.addChild(this.entityContainer);

    if (this.hud) {
      this.hud.attach(this.app);
    }

    this.ensureDamageOverlay();
    this.renderScene();
  }

  public async attach(
    hostElement: HTMLElement,
    worldSize: WorldSize,
  ): Promise<void> {
    this.hostElement = hostElement;
    this.worldSize = { ...worldSize };

    if (!this.app) {
      this.app = new PIXI.Application({
        resizeTo: window,
        backgroundColor: 0xd7f3d2,
        antialias: true,
        autoStart: false,
      });
      window.addEventListener("resize", this.handleResize);
    }

    this.hostElement.innerHTML = "";
    this.hostElement.appendChild(this.app.view as HTMLCanvasElement);
  }

  public async loadPixiTextures(): Promise<void> {
    const mappingUrl = "/hud/item-icons.json";
    let iconMap: Record<string, string> = {};

    try {
      const response = await fetch(mappingUrl);
      if (response.ok) {
        const payload = (await response.json()) as Record<string, string>;
        if (payload && typeof payload === "object") {
          iconMap = payload;
        }
      }
    } catch {
      iconMap = {};
    }

    const defaultPath =
      typeof iconMap.__default__ === "string" && iconMap.__default__.length > 0
        ? iconMap.__default__
        : "/hud/icons/placeholder.png";

    this.itemIconMap = { ...iconMap };
    const iconEntries = Object.entries(iconMap).filter(
      ([key, value]) => key !== "__default__" && typeof value === "string",
    );

    const urlsToLoad = new Set<string>([defaultPath]);
    for (const [, url] of iconEntries) {
      if (url) {
        urlsToLoad.add(url);
      }
    }

    await Promise.all(
      Array.from(urlsToLoad, async (url) => {
        try {
          await PIXI.Assets.load(url);
        } catch {
          // ignore individual failures and fall back to placeholder
        }
      }),
    );

    this.placeholderItemTexture = PIXI.Texture.from(defaultPath);
    this.itemTextures.clear();
    for (const [typeId, url] of iconEntries) {
      if (url) {
        this.itemTextures.set(typeId, PIXI.Texture.from(url));
      }
    }
  }

  public getItemTexture(typeId: string): PIXI.Texture {
    return (
      this.itemTextures.get(typeId) ??
      this.placeholderItemTexture ??
      PIXI.Texture.WHITE
    );
  }

  public setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.drawGrid();
    if (this.app) {
      this.renderScene();
    }
  }

  public update(deltaMs: number): void {
    this.updateDamageOverlay(deltaMs);
    this.updateExplosionEffects(deltaMs);
    this.updateCamera(deltaMs);
    this.updateConfusionEffect(deltaMs);
    this.renderScene();
  }

  public setGridNightBlend(blend: number): void {
    const nextBlend = Math.max(0, Math.min(1, blend));
    if (this.gridNightBlend === nextBlend) {
      return;
    }
    this.gridNightBlend = nextBlend;
    this.drawGrid();
  }

  public setCameraToPlayer(x: number, y: number): void {
    this.cameraTargetX = x;
    this.cameraTargetY = y;

    if (!this.cameraInitialized) {
      this.cameraPivotX = x;
      this.cameraPivotY = y;
      this.cameraInitialized = true;
      this.syncCameraTransform();
    }
  }

  public screenToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!this.app || !this.world) {
      return { x: clientX, y: clientY };
    }

    const rect = this.app.view.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    // Subtract the confusion swim offset so attack targeting stays accurate
    // even while the world container is visually displaced.
    return {
      x: localX - this.world.position.x + this.confusionSwimX + this.world.pivot.x,
      y: localY - this.world.position.y + this.confusionSwimY + this.world.pivot.y,
    };
  }

  public getView(): HTMLCanvasElement | null {
    return this.app?.view ?? null;
  }

  public triggerDamageOverlay(durationMs = 200): void {
    this.damageOverlayDurationMs = Math.max(1, durationMs);
    this.damageOverlayRemainingMs = this.damageOverlayDurationMs;
    this.updateDamageOverlay(0);
  }

  public triggerExplosionEffect(
    x: number,
    y: number,
    radius: number,
    style: ExplosionStyle,
  ): void {
    if (!this.effectContainer) {
      return;
    }

    const graphic = new PIXI.Graphics();
    this.effectContainer.addChild(graphic);
    const durationMs = style === "landmine" ? 320 : 240;
    const effect: ExplosionEffect = {
      graphic,
      remainingMs: durationMs,
      durationMs,
      radius,
      x,
      y,
      style,
    };
    this.explosionEffects.push(effect);
    this.drawExplosionEffect(effect);
  }

  public setConfusionState(active: boolean, intensityRatio: number): void {
    const wasActive = this.confusionActive;
    this.confusionActive = active;
    this.confusionIntensity = Math.max(0, Math.min(1, intensityRatio));

    if (!active) {
      if (wasActive) {
        this.confusionTimeMs = 0;
        this.confusionSwimX = 0;
        this.confusionSwimY = 0;
        this.removeConfusionColorFilter();
        if (this.confusionFlash) this.confusionFlash.visible = false;
        if (this.confusionEdge) this.confusionEdge.visible = false;
        if (this.confusionBloom) this.confusionBloom.visible = false;
      }
      return;
    }

    if (!this.world || !this.app) {
      return;
    }

    // Color filter applied to world — brightness animated per-frame in updateConfusionEffect
    if (!this.confusionColorFilter) {
      this.confusionColorFilter = new ColorMatrixFilter();
    }
    if (!this.world.filters) {
      this.world.filters = [this.confusionColorFilter];
    } else if (!this.world.filters.includes(this.confusionColorFilter)) {
      this.world.filters = [...this.world.filters, this.confusionColorFilter];
    }

    // Create screen-space layers once — all use BlurFilter for smooth gradients
    if (!this.confusionEdge) {
      const sw = this.app.screen.width;
      const sh = this.app.screen.height;
      const cx = sw / 2;
      const cy = sh / 2;
      const minDim = Math.min(sw, sh);

      // Edge vignette: dark olive rect with a large blurred hole.
      // BlurFilter softens the hole boundary into a smooth radial gradient —
      // dark at screen edges, transparent toward center.
      const edge = new PIXI.Graphics();
      const holeR = minDim * 0.32;
      edge.beginFill(0x000000, 1);
      edge.drawRect(-512, -512, sw + 1024, sh + 1024);
      edge.beginHole();
      edge.drawEllipse(cx, cy, holeR, holeR * 0.88);
      edge.endHole();
      edge.endFill();
      const edgeBlur = new PIXI.BlurFilter(120, 1);
      edgeBlur.padding = 140;
      edge.filters = [edgeBlur];
      this.confusionEdge = edge;
      this.app.stage.addChild(edge);

      // Center bloom: soft white glow. Heavy blur turns the ellipse into
      // a smooth light bloom with no visible hard boundary.
      const bloom = new PIXI.Graphics();
      const bloomR = minDim * 0.44;
      bloom.beginFill(0xffffff, 1);
      bloom.drawEllipse(cx, cy, bloomR, bloomR * 0.88);
      bloom.endFill();
      const bloomBlur = new PIXI.BlurFilter(Math.round(bloomR * 0.7), 1);
      bloomBlur.padding = Math.round(bloomR);
      bloom.filters = [bloomBlur];
      this.confusionBloom = bloom;
      this.app.stage.addChild(bloom);

      // Full-screen flash: no blur needed, just alpha
      const flash = new PIXI.Graphics();
      flash.beginFill(0xffffff, 1);
      flash.drawRect(-512, -512, sw + 1024, sh + 1024);
      flash.endFill();
      this.confusionFlash = flash;
      this.app.stage.addChild(flash);
    }

    if (this.confusionEdge) this.confusionEdge.visible = true;
    if (this.confusionBloom) this.confusionBloom.visible = true;
    if (this.confusionFlash) this.confusionFlash.visible = true;
  }

  private removeConfusionColorFilter(): void {
    if (!this.world || !this.confusionColorFilter) {
      return;
    }
    if (this.world.filters) {
      this.world.filters = this.world.filters.filter(
        (f) => f !== this.confusionColorFilter,
      );
      if (this.world.filters.length === 0) {
        this.world.filters = null;
      }
    }
  }

  private updateConfusionEffect(deltaMs: number): void {
    if (!this.confusionActive || !this.world || !this.app) {
      return;
    }

    this.confusionTimeMs += deltaMs;
    const t = this.confusionTimeMs / 1000;
    const intensity = this.confusionIntensity;

    // --- Color filter ---
    // Lerp brightness from 1.0 (normal) toward the effect value so fade-out
    // always returns to normal colors, never goes through black.
    if (this.confusionColorFilter) {
      const flashPhase = Math.max(0, 1 - t / 0.65);
      const targetBrightness = 0.78 + flashPhase * 1.35; // spikes bright at impact
      const brightness = 1.0 + (targetBrightness - 1.0) * intensity;
      const saturation = -0.92 * intensity; // lerps back to 0 (normal) as intensity fades
      this.confusionColorFilter.saturate(saturation, false);
      this.confusionColorFilter.brightness(brightness, true);
    }

    // --- Swimming: ramps in after the flash settles ---
    const swimRamp = Math.min(1, Math.max(0, (t - 0.3) / 0.4));
    const amplitude = intensity * swimRamp * 22;
    const offsetX =
      Math.sin(t * 1.3) * amplitude +
      Math.sin(t * 2.9 + 1.1) * amplitude * 0.35;
    const offsetY =
      Math.cos(t * 1.05 + 0.5) * amplitude * 0.85 +
      Math.cos(t * 2.4 + 2.2) * amplitude * 0.28;
    this.confusionSwimX = offsetX;
    this.confusionSwimY = offsetY;
    this.world.position.x += offsetX;
    this.world.position.y += offsetY;

    // --- Flash: slams full white on impact, gone in 0.6s ---
    if (this.confusionFlash) {
      const flashPhase = Math.max(0, 1 - t / 0.6);
      this.confusionFlash.alpha = flashPhase * 0.93 * intensity;
    }

    // --- Edge vignette: heavy at impact, holds until intensity fades ---
    if (this.confusionEdge) {
      this.confusionEdge.alpha = intensity * (0.97 + Math.sin(t * 1.6) * 0.02);
    }

    // --- Center bloom: appears instantly, fades over ~3s ---
    if (this.confusionBloom) {
      const bloomRamp = Math.min(1, t / 0.12);
      const bloomFade = Math.max(0, 1 - Math.max(0, t - 0.12) / 3.2);
      this.confusionBloom.alpha = bloomRamp * bloomFade * 0.78 * intensity;
    }
  }

  private renderScene(): void {
    if (!this.app) {
      return;
    }
    this.hud?.render(this.app);
    this.app.renderer.render(this.app.stage);
  }

  private updateCamera(deltaMs: number): void {
    if (!this.cameraInitialized) {
      return;
    }

    const effectiveDeltaMs = Math.min(Math.max(deltaMs, 0), 50);
    const smoothingFactor =
      effectiveDeltaMs <= 0
        ? 1
        : 1 -
          Math.exp(
            -effectiveDeltaMs / PixiRenderer.CAMERA_FOLLOW_SMOOTHING_MS,
          );
    this.cameraPivotX = lerp(
      this.cameraPivotX,
      this.cameraTargetX,
      smoothingFactor,
    );
    this.cameraPivotY = lerp(
      this.cameraPivotY,
      this.cameraTargetY,
      smoothingFactor,
    );
    this.syncCameraTransform();
  }

  private syncCameraTransform(): void {
    if (!this.world) {
      return;
    }
    if (!this.app) {
      return;
    }

    this.world.pivot.set(this.cameraPivotX, this.cameraPivotY);
    this.world.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
    );
  }

  private ensureGrid(): void {
    if (!this.app) {
      throw new Error("Pixi App not initialized.");
    }
    if (!this.grid) {
      this.grid = new PIXI.Graphics();
    }
    if (this.world && this.grid.parent !== this.world) {
      this.world.addChild(this.grid);
    }
    this.drawGrid();
  }

  private drawGrid(): void {
    if (!this.grid) {
      return;
    }

    const { w, h } = this.worldSize;
    const cell = Math.max(10, Math.floor(this.gridCellSize));
    const fillColor = this.lerpColor(
      this.gridDayFillColor,
      this.gridNightFillColor,
      this.gridNightBlend,
    );
    const lineColor = this.lerpColor(
      this.gridDayLineColor,
      this.gridNightLineColor,
      this.applyContrastLag(this.gridNightBlend),
    );

    this.grid.clear();
    this.grid.beginFill(fillColor, 1);
    this.grid.drawRect(0, 0, w, h);
    this.grid.endFill();
    const lineVisibility = Math.min(
      1,
      Math.max(0, 2 * Math.abs(this.gridNightBlend - 0.5)),
    );
    this.grid.lineStyle(1, lineColor, 0.4 * lineVisibility);
    this.grid.position.set(0, 0);

    for (let x = 0; x <= w; x += cell) {
      this.grid.moveTo(x, 0);
      this.grid.lineTo(x, h);
    }

    for (let y = 0; y <= h; y += cell) {
      this.grid.moveTo(0, y);
      this.grid.lineTo(w, y);
    }
  }

  private ensureDamageOverlay(): void {
    if (!this.app) {
      throw new Error("Pixi App not initialized.");
    }

    if (!this.damageOverlay) {
      this.damageOverlay = new PIXI.Graphics();
    }
    if (this.damageOverlay.parent !== this.app.stage) {
      this.app.stage.addChild(this.damageOverlay);
    }

    this.drawDamageOverlay();
    this.updateDamageOverlay(0);
  }

  private drawDamageOverlay(): void {
    if (!this.app || !this.damageOverlay) {
      return;
    }

    this.damageOverlay.clear();
    this.damageOverlay.beginFill(0x8f0f0f, 1);
    this.damageOverlay.drawRect(
      0,
      0,
      this.app.screen.width,
      this.app.screen.height,
    );
    this.damageOverlay.endFill();
  }

  private updateDamageOverlay(deltaMs: number): void {
    if (!this.damageOverlay) {
      return;
    }

    this.damageOverlayRemainingMs = Math.max(
      0,
      this.damageOverlayRemainingMs - deltaMs,
    );
    const alpha =
      this.damageOverlayDurationMs <= 0
        ? 0
        : (this.damageOverlayRemainingMs / this.damageOverlayDurationMs) * 0.28;
    this.damageOverlay.alpha = alpha;
    this.damageOverlay.visible = alpha > 0.001;
  }

  private updateExplosionEffects(deltaMs: number): void {
    if (this.explosionEffects.length === 0) {
      return;
    }

    const nextEffects: ExplosionEffect[] = [];
    for (const effect of this.explosionEffects) {
      effect.remainingMs = Math.max(0, effect.remainingMs - deltaMs);
      if (effect.remainingMs <= 0) {
        effect.graphic.destroy();
        continue;
      }

      this.drawExplosionEffect(effect);
      nextEffects.push(effect);
    }

    this.explosionEffects = nextEffects;
  }

  private drawExplosionEffect(effect: ExplosionEffect): void {
    const progress = 1 - effect.remainingMs / Math.max(1, effect.durationMs);
    const primaryColor = effect.style === "landmine" ? 0xff7b21 : 0xffc857;
    const secondaryColor = effect.style === "landmine" ? 0xffd6a0 : 0xfff0bf;
    const ringRadius = effect.radius * (0.25 + progress * 0.75);
    const fillRadius = effect.radius * (0.08 + progress * 0.32);
    const alpha = (1 - progress) * 0.85;

    effect.graphic.clear();
    effect.graphic.position.set(effect.x, effect.y);
    effect.graphic.beginFill(primaryColor, alpha * 0.2);
    effect.graphic.drawCircle(0, 0, fillRadius);
    effect.graphic.endFill();
    effect.graphic.lineStyle(4, primaryColor, alpha);
    effect.graphic.drawCircle(0, 0, ringRadius);
    effect.graphic.lineStyle(2, secondaryColor, alpha * 0.7);
    effect.graphic.drawCircle(0, 0, ringRadius * 0.72);
  }

  private lerpColor(start: number, end: number, t: number): number {
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

  private applyContrastLag(blend: number): number {
    const lag = 0.12;
    if (blend >= 0.5) {
      return Math.min(1, blend + lag);
    }
    return Math.max(0, blend - lag);
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

declare global {
  interface Window {
    app: PIXI.Application<HTMLCanvasElement>;
  }
}
