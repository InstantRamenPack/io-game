import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixijs";

export class CannonRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    graphics.lineStyle(2, 0x000000, lineAlpha);
    graphics.beginFill(fillColor, alpha);
    graphics.drawRect(
      entity.hitboxBounds.minX,
      entity.hitboxBounds.minY,
      entity.hitboxBounds.width,
      entity.hitboxBounds.height,
    );
    graphics.endFill();
  }

  protected getFillColor(): number {
    return 0xc78d2d;
  }
}
