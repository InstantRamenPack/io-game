import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

export class DungeonRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    for (const hitbox of entity.hitboxes) {
      graphics
        .rect(
          hitbox.offsetX - hitbox.width / 2,
          hitbox.offsetY - hitbox.height / 2,
          hitbox.width,
          hitbox.height,
        )
        .fill({ color: fillColor, alpha })
        .stroke({ width: 2, color: 0x202020, alpha: lineAlpha });
    }
  }

  protected getFillColor(): number {
    return 0x777777;
  }
}
