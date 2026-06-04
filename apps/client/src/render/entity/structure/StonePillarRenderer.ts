import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FILL_COLOR = 0x8a8a93;
const STONE_DARK = 0x4a4a52;
const STONE_LIGHT = 0xb6b6c0;
const STONE_OUTLINE = 0x32323a;

export class StonePillarRenderer extends BaseEntityRenderer {
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
      .roundRect(x + 2, y + 2, rect.width - 4, rect.height - 4, 8)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: STONE_OUTLINE, alpha: lineAlpha });
    graphics
      .rect(x + 6, y + 6, rect.width - 12, 6)
      .fill({ color: STONE_LIGHT, alpha: alpha * 0.5 });
    graphics
      .rect(x + 6, y + rect.height - 12, rect.width - 12, 6)
      .fill({ color: STONE_DARK, alpha: alpha * 0.55 });
    graphics
      .rect(rect.offsetX - 2, y + 12, 4, rect.height - 24)
      .fill({ color: STONE_DARK, alpha: alpha * 0.35 });
  }
}
