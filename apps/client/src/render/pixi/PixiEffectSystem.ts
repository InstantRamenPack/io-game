import type { Application, Container, Filter, Texture } from "pixi.js";
import * as PIXI from "pixi.js";
import { PixiOverlayLayer } from "@client/render/pixi/PixiOverlayLayer.ts";
import { PixiParticleLayer } from "@client/render/pixi/PixiParticleLayer.ts";
import type { ExplosionStyle } from "@shared/net/events.ts";

const TICK_MS = 50; // approx ms per server tick at 20 tps

type BeamRecord = {
  gfx: PIXI.Graphics;
  remainingMs: number;
  totalMs: number;
};

type WarningRecord = {
  gfx: PIXI.Graphics;
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
  totalMs: number;
};

export class PixiEffectSystem {
  private readonly particleLayer = new PixiParticleLayer();
  private readonly overlayLayer = new PixiOverlayLayer();
  private readonly worldFilterBuffer: Filter[] = [];
  private lastWorldFilter: Filter | null = null;
  private effectContainer: Container | null = null;

  private readonly activeBeams: BeamRecord[] = [];
  private readonly activeWarnings: WarningRecord[] = [];

  public attach(options: {
    effectContainer: Container;
    overlayContainer: Container;
  }): void {
    this.effectContainer = options.effectContainer;
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
    this.updateBeams(deltaMs);
    this.updateWarnings(deltaMs);
    return this.overlayLayer.getSwimOffset();
  }

  private updateBeams(deltaMs: number): void {
    for (let i = this.activeBeams.length - 1; i >= 0; i--) {
      const rec = this.activeBeams[i]!;
      rec.remainingMs -= deltaMs;
      if (rec.remainingMs <= 0) {
        rec.gfx.parent?.removeChild(rec.gfx);
        rec.gfx.destroy();
        this.activeBeams.splice(i, 1);
      } else {
        rec.gfx.alpha = Math.max(0, rec.remainingMs / rec.totalMs) * 0.85;
      }
    }
  }

  private updateWarnings(deltaMs: number): void {
    for (let i = this.activeWarnings.length - 1; i >= 0; i--) {
      const rec = this.activeWarnings[i]!;
      rec.remainingMs -= deltaMs;
      if (rec.remainingMs <= 0) {
        rec.gfx.parent?.removeChild(rec.gfx);
        rec.gfx.destroy();
        this.activeWarnings.splice(i, 1);
      } else {
        // Pulse: flicker between 0.3 and 0.7 alpha
        const pulse = 0.5 + 0.25 * Math.sin((rec.remainingMs / 120) * Math.PI);
        rec.gfx.alpha = pulse;
      }
    }
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

  public triggerWitherBeam(
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
  ): void {
    if (!this.effectContainer) return;
    const durationMs = 300;
    const gfx = new PIXI.Graphics();
    // Draw the beam as a rotated rectangle centered along the beam direction
    gfx
      .rect(0, -width / 2, length, width)
      .fill({ color: 0x00eaff, alpha: 0.85 });
    gfx.x = x;
    gfx.y = y;
    gfx.rotation = angle;
    this.effectContainer.addChild(gfx);
    this.activeBeams.push({
      gfx,
      remainingMs: durationMs,
      totalMs: durationMs,
    });
  }

  public triggerAirstrikeWarning(
    x: number,
    y: number,
    radius: number,
    warningTicks: number,
  ): void {
    if (!this.effectContainer) return;
    const durationMs = warningTicks * TICK_MS;
    const gfx = new PIXI.Graphics();
    gfx
      .circle(0, 0, radius)
      .fill({ color: 0xff3300, alpha: 0 })
      .circle(0, 0, radius)
      .stroke({ width: 3, color: 0xff4400, alpha: 1 });
    gfx.x = x;
    gfx.y = y;
    this.effectContainer.addChild(gfx);
    this.activeWarnings.push({
      gfx,
      x,
      y,
      radius,
      remainingMs: durationMs,
      totalMs: durationMs,
    });
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
