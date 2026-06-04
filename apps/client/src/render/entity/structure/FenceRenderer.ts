import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FILL_COLOR = 0x8a8a7a;
const STROKE_COLOR = 0x4a4a3a;
const POST_COLOR = 0x6a6a5a;

export class FenceRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    _fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const { minX, minY, width, height } = entity.hitboxBounds;

    graphics
      .rect(minX, minY, width, height)
      .fill({ color: FILL_COLOR, alpha })
      .stroke({ width: 2, color: STROKE_COLOR, alpha: lineAlpha });

    // Fence posts every ~80 units along the long axis
    const isHorizontal = width > height;
    if (isHorizontal) {
      const postSize = height * 1.5;
      const spacing = 80;
      const count = Math.max(2, Math.floor(width / spacing));
      for (let i = 0; i <= count; i++) {
        const px = minX + (i / count) * width - postSize / 2;
        const py = minY + height / 2 - postSize / 2;
        graphics
          .rect(px, py, postSize, postSize)
          .fill({ color: POST_COLOR, alpha });
      }
    } else {
      const postSize = width * 1.5;
      const spacing = 80;
      const count = Math.max(2, Math.floor(height / spacing));
      for (let i = 0; i <= count; i++) {
        const px = minX + width / 2 - postSize / 2;
        const py = minY + (i / count) * height - postSize / 2;
        graphics
          .rect(px, py, postSize, postSize)
          .fill({ color: POST_COLOR, alpha });
      }
    }
  }

  protected getFillColor(): number {
    return FILL_COLOR;
  }
}
