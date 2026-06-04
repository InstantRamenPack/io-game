import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const WOOD_DARK = 0x5d3c1c;
const WOOD_OUTLINE = 0x3a2414;
const METAL = 0xb9bcc6;

export class WeaponRackRenderer extends BaseEntityRenderer {
  protected getFillColor(_entity: ClientEntity): number {
    return 0x6e451f;
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    _fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    const rect = entity.hitboxes[0];
    if (!rect) {
      return;
    }

    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    const w = rect.width;
    const h = rect.height;
    graphics
      .rect(x + 2, y + h * 0.62, w - 4, h * 0.3)
      .fill({ color: 0x7a5230, alpha })
      .stroke({ width: 2, color: WOOD_OUTLINE, alpha: lineAlpha });
    graphics
      .rect(x + 2, y + h * 0.2, w - 4, 5)
      .fill({ color: WOOD_DARK, alpha })
      .stroke({ width: 1.5, color: WOOD_OUTLINE, alpha: lineAlpha });
    for (const sign of [0, 1]) {
      graphics
        .rect(x + 3 + sign * (w - 8), y + h * 0.2, 5, h * 0.6)
        .fill({ color: WOOD_DARK, alpha });
    }
    const slots = [0.22, 0.42, 0.62, 0.82];
    slots.forEach((slot, index) => {
      const sx = x + w * slot;
      const topY = y + 1;
      const bottomY = y + h * 0.66;
      if (index % 2 === 0) {
        graphics
          .moveTo(sx, topY)
          .lineTo(sx, bottomY)
          .stroke({ width: 3, color: METAL, alpha });
        graphics
          .poly([sx - 4, topY + 4, sx, topY - 2, sx + 4, topY + 4])
          .fill({ color: METAL, alpha });
      } else {
        graphics
          .moveTo(sx, topY + 2)
          .lineTo(sx, bottomY)
          .stroke({ width: 3, color: 0x8a5a2b, alpha });
        graphics
          .poly([sx - 5, topY + 6, sx, topY, sx + 5, topY + 6])
          .fill({ color: METAL, alpha });
      }
    });
  }
}
