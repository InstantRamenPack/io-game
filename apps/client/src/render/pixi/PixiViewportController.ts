import type { Application, Container } from "pixi.js";

type WorldSize = { w: number; h: number };

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

  constructor(worldSize: WorldSize) {
    this.worldSize = worldSize;
  }

  public setWorldSize(worldSize: WorldSize): void {
    this.worldSize = { ...worldSize };
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

  public clientToScreen(
    app: Application,
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const rect = (app.canvas as HTMLCanvasElement).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    return {
      x: ((clientX - rect.left) / rect.width) * app.screen.width,
      y: ((clientY - rect.top) / rect.height) * app.screen.height,
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
        (screenPoint.x - worldRoot.position.x + this.swimOffsetX) /
          worldRoot.scale.x +
        worldRoot.pivot.x,
      y:
        (screenPoint.y - worldRoot.position.y + this.swimOffsetY) /
          worldRoot.scale.y +
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
}
