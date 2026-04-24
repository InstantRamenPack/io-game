import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FABRIC_COLOR = 0x8d7b6a;
const RIDGE_COLOR = 0x5a4a3a;
const STAKE_COLOR = 0x4a3a2a;

export class TentRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    _fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const { minX, minY, width, height, centerX, centerY } = entity.hitboxBounds;

    // Tent body as triangle-top shape
    const points = [
      minX,
      minY + height,
      centerX,
      minY,
      minX + width,
      minY + height,
    ];
    graphics
      .poly(points)
      .fill({ color: FABRIC_COLOR, alpha })
      .stroke({ width: 2, color: RIDGE_COLOR, alpha: lineAlpha });

    // Ridge line at top
    graphics
      .moveTo(centerX, minY)
      .lineTo(centerX, minY + height * 0.7)
      .stroke({ width: 2, color: RIDGE_COLOR, alpha: lineAlpha * 0.8 });

    // Door opening
    const doorW = width * 0.22;
    const doorH = height * 0.42;
    graphics
      .rect(centerX - doorW / 2, minY + height - doorH, doorW, doorH)
      .fill({ color: STAKE_COLOR, alpha: alpha * 0.7 });
  }

  protected getFillColor(): number {
    return FABRIC_COLOR;
  }
}
