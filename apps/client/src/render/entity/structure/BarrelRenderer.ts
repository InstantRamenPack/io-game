import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FILL_COLOR = 0x8a5a2b;
const WOOD_DARK = 0x5d3c1c;
const WOOD_OUTLINE = 0x3a2414;
const METAL_DARK = 0x5c5f68;
const GOLD_LIGHT = 0xfff2a8;

export class BarrelRenderer extends BaseEntityRenderer {
  protected getFillColor(_entity: ClientEntity): number {
    return FILL_COLOR;
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
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
    graphics
      .roundRect(x + 3, y + 1, rect.width - 6, rect.height - 2, 10)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: WOOD_OUTLINE, alpha: lineAlpha });
    for (const staveX of [
      x + rect.width * 0.36,
      x + rect.width * 0.5,
      x + rect.width * 0.64,
    ]) {
      graphics
        .rect(staveX - 1, y + 4, 2, rect.height - 8)
        .fill({ color: WOOD_DARK, alpha: alpha * 0.6 });
    }
    for (const hoopY of [y + rect.height * 0.26, y + rect.height * 0.72]) {
      graphics
        .rect(x + 4, hoopY, rect.width - 8, 4)
        .fill({ color: METAL_DARK, alpha });
    }
    graphics
      .ellipse(rect.offsetX, y + 6, rect.width * 0.34, 4)
      .fill({ color: GOLD_LIGHT, alpha: alpha * 0.2 });
  }
}
