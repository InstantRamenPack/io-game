import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import { drawRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type * as PIXI from "pixi.js";

export class CannonRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    drawRect(
      graphics,
      entity.hitboxBounds.minX,
      entity.hitboxBounds.minY,
      entity.hitboxBounds.width,
      entity.hitboxBounds.height,
      { color: fillColor, alpha },
      { width: 2, color: 0x000000, alpha: lineAlpha },
    );
  }

  protected getFillColor(): number {
    return 0xc78d2d;
  }
}
