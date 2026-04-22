import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type * as PIXI from "pixi.js";

export class ChestRenderer extends BaseEntityRenderer {
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
      6,
      { color: fillColor, alpha },
      { width: 2, color: 0x000000, alpha: lineAlpha },
    );
    // Draw lid line across the top third
    if (alpha > 0) {
      graphics
        .moveTo(minX + 2, minY + height * 0.35)
        .lineTo(minX + width - 2, minY + height * 0.35)
        .stroke({ width: 2, color: 0x000000, alpha: lineAlpha * 0.6 });
      // Draw clasp
      const claspW = width * 0.16;
      const claspH = height * 0.18;
      const claspX = minX + (width - claspW) / 2;
      const claspY = minY + height * 0.26;
      graphics
        .roundRect(claspX, claspY, claspW, claspH, 2)
        .stroke({ width: 1.5, color: 0x000000, alpha: lineAlpha * 0.7 });
    }
  }

  protected getFillColor(): number {
    return 0xc8912a;
  }
}
