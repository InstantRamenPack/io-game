import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import * as PIXI from "pixijs";

export class WallRenderer extends BaseEntityRenderer {
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
    graphics.drawRoundedRect(
      entity.hitboxBounds.minX,
      entity.hitboxBounds.minY,
      entity.hitboxBounds.width,
      entity.hitboxBounds.height,
      4,
    );
    graphics.endFill();
  }

  protected getFillColor(): number {
    return 0x8b6f57;
  }
}
