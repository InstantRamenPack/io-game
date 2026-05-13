import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

export class TripwireRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    const bounds = entity.hitboxBounds;
    graphics
      .rect(bounds.minX, bounds.centerY - 3, bounds.width, 6)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 1, color: 0x2b0b0b, alpha: lineAlpha });
  }

  protected getFillColor(): number {
    return 0xd33a2c;
  }
}
