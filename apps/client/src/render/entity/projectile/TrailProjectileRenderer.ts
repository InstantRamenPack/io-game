import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";
import type {
  EntityPresentationState,
  EntityRendererOptions,
} from "@client/render/entity/EntityRenderer.ts";
import type { PixiRenderer } from "@client/render/PixiRenderer.ts";
import * as PIXI from "pixi.js";

type TrailPoint = {
  x: number;
  y: number;
  ageMs: number;
};

const TRAIL_LIFETIME_MS = 120;
const TRAIL_MIN_STEP_PX = 2;

export class TrailProjectileRenderer extends CircleEntityRenderer {
  private readonly trailGraphic: PIXI.Graphics;
  private readonly trailPoints: TrailPoint[] = [];

  constructor(
    pixiRenderer: PixiRenderer,
    fillColor: number,
    options: EntityRendererOptions = {},
  ) {
    super(pixiRenderer, fillColor, options);
    this.trailGraphic = new PIXI.Graphics();
    this.entityContainer.addChildAt(this.trailGraphic, 0);
  }

  public override sync(
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    super.sync(entity, presentation);
    this.pushTrailPoint(
      presentation?.x ?? entity.x,
      presentation?.y ?? entity.y,
    );
  }

  public override update(
    deltaMs: number,
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    super.update(deltaMs, entity, presentation);
    this.ageTrail(deltaMs);
    this.redrawTrail();
  }

  public override destroy(): void {
    this.trailGraphic.destroy();
    super.destroy();
  }

  private pushTrailPoint(x: number, y: number): void {
    const lastPoint = this.trailPoints[this.trailPoints.length - 1];
    if (lastPoint) {
      const dx = x - lastPoint.x;
      const dy = y - lastPoint.y;
      if (dx * dx + dy * dy < TRAIL_MIN_STEP_PX * TRAIL_MIN_STEP_PX) {
        lastPoint.ageMs = 0;
        return;
      }
    }

    this.trailPoints.push({ x, y, ageMs: 0 });
    while (this.trailPoints.length > 8) {
      this.trailPoints.shift();
    }
  }

  private ageTrail(deltaMs: number): void {
    for (const point of this.trailPoints) {
      point.ageMs += deltaMs;
    }
    while (this.trailPoints[0]?.ageMs !== undefined) {
      const firstPoint = this.trailPoints[0];
      if (!firstPoint || firstPoint.ageMs < TRAIL_LIFETIME_MS) {
        break;
      }
      this.trailPoints.shift();
    }
  }

  private redrawTrail(): void {
    this.trailGraphic.clear();
    if (this.trailPoints.length < 2) {
      return;
    }

    const newestPoint = this.trailPoints[this.trailPoints.length - 1];
    if (!newestPoint) {
      return;
    }
    for (let index = this.trailPoints.length - 2; index >= 0; index -= 1) {
      const point = this.trailPoints[index];
      const next = this.trailPoints[index + 1];
      if (!point || !next) {
        continue;
      }
      const alpha =
        0.22 * (1 - Math.max(point.ageMs, next.ageMs) / TRAIL_LIFETIME_MS);
      if (alpha <= 0.01) {
        continue;
      }

      this.trailGraphic
        .moveTo(point.x - newestPoint.x, point.y - newestPoint.y)
        .lineTo(next.x - newestPoint.x, next.y - newestPoint.y)
        .stroke({
          width: 2,
          color: 0xffffff,
          alpha,
        });
    }
  }
}
