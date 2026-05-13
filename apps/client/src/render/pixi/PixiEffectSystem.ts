import type { Application, Container, Filter, Texture } from "pixi.js";
import { PixiOverlayLayer } from "@client/render/pixi/PixiOverlayLayer.ts";
import { PixiParticleLayer } from "@client/render/pixi/PixiParticleLayer.ts";
import type { ExplosionStyle } from "@shared/net/events.ts";

export class PixiEffectSystem {
  private readonly particleLayer = new PixiParticleLayer();
  private readonly overlayLayer = new PixiOverlayLayer();
  private readonly worldFilterBuffer: Filter[] = [];
  private lastWorldFilter: Filter | null = null;

  public attach(options: {
    effectContainer: Container;
    overlayContainer: Container;
  }): void {
    this.particleLayer.attach(options.effectContainer);
    this.overlayLayer.attach(options.overlayContainer);
  }

  public setTextures(options: { softCircle: Texture; ring: Texture }): void {
    this.particleLayer.setTextures(options);
  }

  public resize(app: Application): void {
    this.overlayLayer.resize(app);
  }

  public update(app: Application, deltaMs: number): { x: number; y: number } {
    this.particleLayer.update(deltaMs);
    this.overlayLayer.update(app, deltaMs);
    return this.overlayLayer.getSwimOffset();
  }

  public triggerDamageOverlay(durationMs = 200): void {
    this.overlayLayer.triggerDamageOverlay(durationMs);
  }

  public triggerExplosionEffect(
    x: number,
    y: number,
    radius: number,
    style: ExplosionStyle,
  ): void {
    this.particleLayer.triggerExplosion(x, y, radius, style);
  }

  public triggerCrateBreakEffect(x: number, y: number): void {
    this.particleLayer.triggerCrateBreak(x, y);
  }

  public setConfusionState(active: boolean, intensityRatio: number): void {
    this.overlayLayer.setConfusionState(active, intensityRatio);
  }

  public syncWorldFilters(worldRoot: Container): void {
    const filter = this.overlayLayer.getWorldFilter();
    if (filter === this.lastWorldFilter) {
      return;
    }

    this.lastWorldFilter = filter;
    if (!filter) {
      this.worldFilterBuffer.length = 0;
      worldRoot.filters = null;
      return;
    }

    this.worldFilterBuffer[0] = filter;
    this.worldFilterBuffer.length = 1;
    worldRoot.filters = this.worldFilterBuffer;
  }
}
