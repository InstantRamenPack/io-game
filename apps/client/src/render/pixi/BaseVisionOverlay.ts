import { Container, Graphics } from "pixi.js";

const BASE_W = 1600;
const BASE_H = 1200;
const BASE_DARK_ALPHA = 0.65;
const FLICKER_RANGE = 0.08;

export class BaseVisionOverlay {
  public readonly container: Container;
  private readonly graphics: Graphics;
  private energyActive = true;
  private flickerTime = 0;
  private worldW = 12288;
  private worldH = 12288;

  constructor() {
    this.container = new Container();
    this.container.visible = false;
    this.container.zIndex = 30;

    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  public setWorldSize(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
    this.redraw();
  }

  public setEnergyActive(active: boolean): void {
    if (this.energyActive === active) return;
    this.energyActive = active;
    this.container.visible = !active;
    if (!active) {
      this.flickerTime = 0;
    }
  }

  public update(deltaMs: number): void {
    if (this.energyActive) return;
    this.flickerTime += deltaMs * 0.004;
    const flicker =
      Math.sin(this.flickerTime * 7.3) * 0.4 +
      Math.sin(this.flickerTime * 3.1) * 0.3 +
      Math.sin(this.flickerTime * 13.7) * 0.3;
    const alpha = BASE_DARK_ALPHA + flicker * FLICKER_RANGE;
    this.graphics.alpha = Math.max(0.5, Math.min(0.82, alpha));
  }

  private redraw(): void {
    const baseX = (this.worldW - BASE_W) / 2;
    const baseY = (this.worldH - BASE_H) / 2;
    this.graphics.clear();
    this.graphics
      .rect(baseX, baseY, BASE_W, BASE_H)
      .fill({ color: 0x000000, alpha: 1 });
  }
}
