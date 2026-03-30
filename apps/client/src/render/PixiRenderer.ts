import * as PIXI from "pixijs";
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
  private app: PIXI.Application<HTMLCanvasElement> | null = null;
  private world: PIXI.Container | null = null;
  private grid: PIXI.Graphics | null = null;
  private effectContainer: PIXI.Container | null = null;
  public entityContainer: PIXI.Container | null = null;
  private damageOverlay: PIXI.Graphics | null = null;
  private hud: PixiHud | null = null;
  private damageOverlayRemainingMs = 0;
  private damageOverlayDurationMs = 200;
  private explosionEffects: ExplosionEffect[] = [];
  private gridCellSize = 100;
  private gridNightBlend = 0;
  private readonly gridDayFillColor = 0xd7f3d2;
  private readonly gridNightFillColor = 0x3f5f46;
  private readonly gridDayLineColor = 0x2d4f37;
  private readonly gridNightLineColor = 0x9fd69a;
  private worldSize: WorldSize;
  private hostElement: HTMLElement | null = null;

  public playerEntityId?: number;

  private readonly handleResize = (): void => {
    if (!this.app) {
      return;
    }
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.drawDamageOverlay();
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
    // placeholder for future sprite loading
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
    if (!this.world) {
      throw new Error("World container not initialized.");
    }
    if (!this.app) {
      throw new Error("Pixi App not initialized.");
    }
    this.world.pivot.set(x, y);
    this.world.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
    );
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

    return {
      x: localX - this.world.position.x + this.world.pivot.x,
      y: localY - this.world.position.y + this.world.pivot.y,
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

  private renderScene(): void {
    if (!this.app) {
      return;
    }
    this.hud?.render(this.app);
    this.app.renderer.render(this.app.stage);
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

declare global {
  interface Window {
    app: PIXI.Application<HTMLCanvasElement>;
  }
}
