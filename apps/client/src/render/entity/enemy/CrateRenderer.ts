import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type * as PIXI from "pixi.js";

export class CrateRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const { minX, minY, width, height } = entity.hitboxBounds;
    drawRoundedRect(
      graphics,
      minX,
      minY,
      width,
      height,
      3,
      { color: fillColor, alpha },
      { width: 2, color: 0x2c1b10, alpha: lineAlpha },
    );
    if (alpha <= 0) {
      return;
    }

    graphics
      .moveTo(minX + width * 0.18, minY + 2)
      .lineTo(minX + width * 0.18, minY + height - 2)
      .moveTo(minX + width * 0.82, minY + 2)
      .lineTo(minX + width * 0.82, minY + height - 2)
      .moveTo(minX + 2, minY + height * 0.5)
      .lineTo(minX + width - 2, minY + height * 0.5)
      .stroke({ width: 2, color: 0x2c1b10, alpha: lineAlpha * 0.55 });
  }

  protected getFillColor(): number {
    return 0x9b6a34;
  }
}
