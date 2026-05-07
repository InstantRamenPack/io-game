import { Container, Graphics } from "pixi.js";

const BASE_X = 4200;
const BASE_Y = 2900;
const BASE_W = 1600;
const BASE_H = 1200;
const BASE_DARK_ALPHA = 0.65;
const FLICKER_RANGE = 0.08;

/**
 * Darkness fog over the base area when the Energy Tower is offline.
 * Covers the entire base with a dark overlay that flickers slightly,
 * simulating a power outage.
 */
export class BaseVisionOverlay {
  public readonly container: Container;
  private readonly graphics: Graphics;
  private energyActive = true;
  private flickerTime = 0;

  constructor() {
    this.container = new Container();
    this.container.visible = false;
    this.container.zIndex = 30;

    this.graphics = new Graphics();
    this.graphics
      .rect(BASE_X, BASE_Y, BASE_W, BASE_H)
      .fill({ color: 0x000000, alpha: 1 });
    this.container.addChild(this.graphics);
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
}
