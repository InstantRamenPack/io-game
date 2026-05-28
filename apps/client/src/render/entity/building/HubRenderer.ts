import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const HUB_FILL = 0x6b4a2f;
const HUB_STROKE = 0x3d2818;
const HUB_BAND = 0x8a6240;

export class HubRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const { minX, minY, width, height } = entity.hitboxBounds;

    graphics.clear();

    graphics
      .roundRect(minX, minY, width, height, 6)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 3, color: HUB_STROKE, alpha: lineAlpha });

    const roofH = Math.max(14, height * 0.1);
    graphics
      .roundRect(minX, minY, width, roofH, 4)
      .fill({ color: HUB_BAND, alpha });

    const cx = minX + width / 2;
    graphics
      .rect(cx - 3, minY - 14, 6, 16)
      .fill({ color: HUB_STROKE, alpha });
    graphics.circle(cx, minY - 16, 3).fill({ color: HUB_BAND, alpha });
  }

  protected getFillColor(_entity: ClientEntity): number {
    return HUB_FILL;
  }
}
