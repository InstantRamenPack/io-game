import type { Application, Container } from "pixi.js";
import type { WorldSize } from "@client/render/renderTypes.ts";

export class PixiViewportController {
  private worldSize: WorldSize;
  private cameraPivotX = 0;
  private cameraPivotY = 0;
  private cameraTargetX = 0;
  private cameraTargetY = 0;
  private cameraInitialized = false;
  private gameplayViewportWidth = 0;
  private gameplayViewportHeight = 0;
  private swimOffsetX = 0;
  private swimOffsetY = 0;
  private viewRectCache: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
  }

  public setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
    this.viewRectCache = null;
  }

  public invalidateViewRectCache(): void {
    this.viewRectCache = null;
  }

  public setCameraTarget(x: number, y: number): void {
    this.cameraTargetX = x;
    this.cameraTargetY = y;

    if (!this.cameraInitialized) {
      this.cameraPivotX = x;
      this.cameraPivotY = y;
      this.cameraInitialized = true;
    }
  }

  public setSwimOffset(x: number, y: number): void {
    this.swimOffsetX = x;
    this.swimOffsetY = y;
  }

  public reset(): void {
    this.cameraInitialized = false;
    this.swimOffsetX = 0;
    this.swimOffsetY = 0;
    this.viewRectCache = null;
  }

  public update(deltaMs: number, app: Application, worldRoot: Container): void {
    if (!this.cameraInitialized) {
      return;
    }

    // Immediately lock camera pivot to target (no smoothing)
    this.cameraPivotX = this.cameraTargetX;
    this.cameraPivotY = this.cameraTargetY;
    this.sync(app, worldRoot);
  }

  public sync(app: Application, worldRoot: Container): void {
    this.captureGameplayViewportSize(app);
    const scale = this.getGameplayScale(app);
    worldRoot.pivot.set(this.cameraPivotX, this.cameraPivotY);
    worldRoot.scale.set(scale, scale);
    worldRoot.position.set(
      app.screen.width / 2 + this.swimOffsetX,
      app.screen.height / 2 + this.swimOffsetY,
    );
  }

  public getWorldViewportBounds(app: Application): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const scale = this.getGameplayScale(app);
    const halfWidth = app.screen.width / Math.max(Number.EPSILON, scale) / 2;
    const halfHeight = app.screen.height / Math.max(Number.EPSILON, scale) / 2;
    return {
      minX: this.cameraPivotX - halfWidth,
      minY: this.cameraPivotY - halfHeight,
      maxX: this.cameraPivotX + halfWidth,
      maxY: this.cameraPivotY + halfHeight,
    };
  }

  public clientToScreen(
    app: Application,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const rect = this.getCanvasRect(app);
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    return {
      x: ((clientX - rect.left) / rect.width) * app.screen.width,
      y: ((clientY - rect.top) / rect.height) * app.screen.height,
    };
  }

  public getCanvasCenterClient(app: Application): { x: number; y: number } {
    const rect = this.getCanvasRect(app);
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  public screenToWorld(
    app: Application,
    worldRoot: Container,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const screenPoint = this.clientToScreen(app, clientX, clientY);
    return {
      x:
        (screenPoint.x - worldRoot.position.x) / worldRoot.scale.x +
        worldRoot.pivot.x,
      y:
        (screenPoint.y - worldRoot.position.y) / worldRoot.scale.y +
        worldRoot.pivot.y,
    };
  }

  private captureGameplayViewportSize(app: Application): void {
    this.gameplayViewportWidth = Math.max(1, app.screen.width);
    this.gameplayViewportHeight = Math.max(1, app.screen.height);
  }

  private getGameplayScale(app: Application): number {
    const baseWidth = Math.max(1, this.gameplayViewportWidth);
    const baseHeight = Math.max(1, this.gameplayViewportHeight);
    return Math.min(
      app.screen.width / baseWidth,
      app.screen.height / baseHeight,
    );
  }

  private getCanvasRect(app: Application): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const cached = this.viewRectCache;
    if (cached) {
      return cached;
    }

    const canvas = app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();

    this.viewRectCache = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    return this.viewRectCache;
  }
}
