import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type {
  EntityPresentationState,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import { drawCircle } from "@client/render/pixi/PixiGraphicUtils.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import {
  TESLA_SHOCK_RADIUS,
  getTeslaShockWaveDurationTicks,
} from "@shared/gameplay/teslaShock.ts";
import * as PIXI from "pixi.js";

const PULSE_RING_WIDTH = 4;
const PULSE_START_RADIUS = 16;

export class TeslaRenderer extends BaseEntityRenderer {
  private readonly pulseRingGraphic: PIXI.Graphics;
  private pulseRemainingMs = 0;

  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {
    super(pixiRenderer, options);
    this.pulseRingGraphic = new PIXI.Graphics();
    this.entityContainer.addChildAt(this.pulseRingGraphic, 0);
  }

  public playTeslaShockPulse(): void {
    const tickRate = Math.max(1, this.pixiRenderer.getTickRate());
    this.pulseRemainingMs =
      (getTeslaShockWaveDurationTicks() / tickRate) * 1000;
  }

  public override update(
    deltaMs: number,
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    super.update(deltaMs, entity, presentation);
    if (!entity.alive) {
      this.pulseRingGraphic.clear();
      this.pulseRemainingMs = 0;
      return;
    }

    if (this.pulseRemainingMs > 0) {
      this.pulseRemainingMs = Math.max(0, this.pulseRemainingMs - deltaMs);
    }

    this.redrawPulseRing();
  }

  public override hasTransientAnimation(): boolean {
    return this.pulseRemainingMs > 0.001;
  }

  public override destroy(): void {
    this.pulseRingGraphic.destroy();
    super.destroy();
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    drawCircle(
      graphics,
      0,
      0,
      TESLA_SHOCK_RADIUS,
      { color: 0x65d9ff, alpha: alpha * 0.12 },
      { width: 2, color: 0x5ff4ff, alpha: lineAlpha * 0.35 },
    );
    drawCircle(
      graphics,
      0,
      0,
      22,
      { color: fillColor, alpha },
      { width: 2, color: 0x10212a, alpha: lineAlpha },
    );
    drawCircle(
      graphics,
      0,
      0,
      10,
      { color: 0xcff8ff, alpha },
      { width: 2, color: 0x2489ff, alpha: lineAlpha },
    );

    graphics
      .moveTo(-14, -4)
      .lineTo(-2, -14)
      .lineTo(2, -3)
      .lineTo(15, -12)
      .lineTo(6, 2)
      .lineTo(14, 5)
      .lineTo(0, 16)
      .lineTo(4, 5)
      .lineTo(-14, 12)
      .lineTo(-5, 1)
      .closePath()
      .fill({ color: 0xf6fbff, alpha: alpha * 0.9 });
  }

  protected getFillColor(): number {
    return 0x376a72;
  }

  private redrawPulseRing(): void {
    this.pulseRingGraphic.clear();
    if (this.pulseRemainingMs <= 0) {
      return;
    }

    const pulseDurationMs = Math.max(
      1,
      (getTeslaShockWaveDurationTicks() /
        Math.max(1, this.pixiRenderer.getTickRate())) *
        1000,
    );
    const progress = 1 - this.pulseRemainingMs / pulseDurationMs;
    const radius =
      PULSE_START_RADIUS + (TESLA_SHOCK_RADIUS - PULSE_START_RADIUS) * progress;
    this.pulseRingGraphic
      .circle(0, 0, radius)
      .stroke({ width: PULSE_RING_WIDTH, color: 0xffffff, alpha: 1 });
  }
}
