import {
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Graphics,
} from "pixi.js";
import type { Application } from "pixi.js";

export class PixiOverlayLayer {
  public readonly container = new Container({ label: "overlayLayer" });

  private readonly damageOverlay = new Graphics();
  private readonly confusionFlash = new Graphics();
  private readonly confusionEdge = new Graphics();
  private readonly confusionBloom = new Graphics();
  private readonly confusionColorFilter = new ColorMatrixFilter();
  private damageOverlayRemainingMs = 0;
  private damageOverlayDurationMs = 200;
  private confusionActive = false;
  private confusionIntensity = 0;
  private confusionTimeMs = 0;
  private swimOffsetX = 0;
  private swimOffsetY = 0;

  constructor() {
    this.container.interactiveChildren = false;
    this.container.addChild(
      this.damageOverlay,
      this.confusionEdge,
      this.confusionBloom,
      this.confusionFlash,
    );
    this.confusionEdge.visible = false;
    this.confusionBloom.visible = false;
    this.confusionFlash.visible = false;
  }

  public attach(parent: Container): void {
    if (this.container.parent !== parent) {
      parent.addChild(this.container);
    }
  }

  public getWorldFilter(): ColorMatrixFilter | null {
    return this.confusionActive ? this.confusionColorFilter : null;
  }

  public getSwimOffset(): { x: number; y: number } {
    return { x: this.swimOffsetX, y: this.swimOffsetY };
  }

  public resize(app: Application): void {
    this.drawDamageOverlay(app);
    this.drawConfusionSurfaces(app);
  }

  public triggerDamageOverlay(durationMs = 200): void {
    this.damageOverlayDurationMs = Math.max(1, durationMs);
    this.damageOverlayRemainingMs = this.damageOverlayDurationMs;
    this.updateDamageOverlay(0);
  }

  public setConfusionState(active: boolean, intensityRatio: number): void {
    this.confusionActive = active;
    this.confusionIntensity = Math.max(0, Math.min(1, intensityRatio));

    if (!active) {
      this.confusionTimeMs = 0;
      this.swimOffsetX = 0;
      this.swimOffsetY = 0;
      this.confusionFlash.visible = false;
      this.confusionEdge.visible = false;
      this.confusionBloom.visible = false;
    }
  }

  public update(app: Application, deltaMs: number): void {
    this.updateDamageOverlay(deltaMs);
    this.updateConfusion(app, deltaMs);
  }

  private drawDamageOverlay(app: Application): void {
    this.damageOverlay.clear();
    this.damageOverlay
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: 0x8f0f0f, alpha: 1 });
    this.damageOverlay.filterArea = app.screen;
  }

  private drawConfusionSurfaces(app: Application): void {
    const sw = app.screen.width;
    const sh = app.screen.height;
    const cx = sw / 2;
    const cy = sh / 2;
    const minDim = Math.min(sw, sh);

    const holeR = minDim * 0.32;
    this.confusionEdge.clear();
    this.confusionEdge
      .rect(-512, -512, sw + 1024, sh + 1024)
      .fill({ color: 0x000000, alpha: 1 })
      .ellipse(cx, cy, holeR, holeR * 0.88)
      .cut();
    const edgeBlur = new BlurFilter({ strength: 12, quality: 1 });
    edgeBlur.padding = 140;
    this.confusionEdge.filters = [edgeBlur];
    this.confusionEdge.filterArea = app.screen;

    const bloomR = minDim * 0.44;
    this.confusionBloom.clear();
    this.confusionBloom
      .ellipse(cx, cy, bloomR, bloomR * 0.88)
      .fill({ color: 0xffffff, alpha: 1 });
    const bloomBlur = new BlurFilter({ strength: Math.max(8, bloomR * 0.08), quality: 1 });
    bloomBlur.padding = Math.round(bloomR);
    this.confusionBloom.filters = [bloomBlur];
    this.confusionBloom.filterArea = app.screen;

    this.confusionFlash.clear();
    this.confusionFlash
      .rect(-512, -512, sw + 1024, sh + 1024)
      .fill({ color: 0xffffff, alpha: 1 });
    this.confusionFlash.filterArea = app.screen;
  }

  private updateDamageOverlay(deltaMs: number): void {
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

  private updateConfusion(
    app: Application,
    deltaMs: number,
  ): void {
    if (!this.confusionActive) {
      return;
    }

    this.confusionTimeMs += deltaMs;
    const t = this.confusionTimeMs / 1000;
    const intensity = this.confusionIntensity;

    const flashPhase = Math.max(0, 1 - t / 0.65);
    const targetBrightness = 0.78 + flashPhase * 1.35;
    const brightness = 1 + (targetBrightness - 1) * intensity;
    const saturation = -0.92 * intensity;
    this.confusionColorFilter.saturate(saturation, false);
    this.confusionColorFilter.brightness(brightness, true);

    const swimRamp = Math.min(1, Math.max(0, (t - 0.3) / 0.4));
    const amplitude = intensity * swimRamp * 22;
    this.swimOffsetX =
      Math.sin(t * 1.3) * amplitude +
      Math.sin(t * 2.9 + 1.1) * amplitude * 0.35;
    this.swimOffsetY =
      Math.cos(t * 1.05 + 0.5) * amplitude * 0.85 +
      Math.cos(t * 2.4 + 2.2) * amplitude * 0.28;

    this.confusionFlash.visible = true;
    this.confusionEdge.visible = true;
    this.confusionBloom.visible = true;
    this.confusionFlash.alpha = flashPhase * 0.93 * intensity;
    this.confusionEdge.alpha = intensity * (0.97 + Math.sin(t * 1.6) * 0.02);

    const bloomRamp = Math.min(1, t / 0.12);
    const bloomFade = Math.max(0, 1 - Math.max(0, t - 0.12) / 3.2);
    this.confusionBloom.alpha = bloomRamp * bloomFade * 0.78 * intensity;

    this.container.filterArea = app.screen;
  }
}

