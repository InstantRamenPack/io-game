import * as PIXI from "pixijs";
import type { GameClient } from "@client/client/GameClient.ts";
import type { GameSelectors } from "@client/app/gameSelectors.ts";
import { PixiHud } from "@client/render/PixiHud.ts";

type WorldSize = { w: number; h: number };

/**
 * Rendering adapter for visible entity state.
 * Owns the Pixi scene lifecycle and exposes the shared entity layer consumed
 * by dedicated entity renderer classes.
 */
export class PixiRenderer {
  private app: PIXI.Application<HTMLCanvasElement> | null = null;
  private world: PIXI.Container | null = null;
  private grid: PIXI.Graphics | null = null;
  public entityContainer: PIXI.Container | null = null;
  private damageOverlay: PIXI.Graphics | null = null;
  private hud: PixiHud | null = null;
  private damageOverlayRemainingMs = 0;
  private damageOverlayDurationMs = 200;
  private gridCellSize = 100;
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

  public constructor(worldSize: WorldSize) {
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
    this.renderScene();
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

    this.grid.clear();
    this.grid.lineStyle(1, 0x9fd69a, 0.4);
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
}

declare global {
  interface Window {
    app: PIXI.Application<HTMLCanvasElement>;
  }
}
