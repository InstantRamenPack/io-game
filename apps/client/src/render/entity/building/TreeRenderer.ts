import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const CANOPY_COLOR = 0x2d5a27;
const TRUNK_COLOR = 0x6b4226;

export class TreeRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    _fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const cx = entity.hitboxBounds.centerX;
    const cy = entity.hitboxBounds.centerY;
    const r = entity.hitboxBounds.width / 2;
    const trunkW = r * 0.35;
    const trunkH = r * 0.45;

    graphics
      .rect(cx - trunkW / 2, cy - trunkH / 2, trunkW, trunkH)
      .fill({ color: TRUNK_COLOR, alpha });

    graphics
      .circle(cx, cy - r * 0.12, r * 0.72)
      .fill({ color: CANOPY_COLOR, alpha })
      .stroke({ width: 2, color: 0x1a3a14, alpha: lineAlpha * 0.7 });

    graphics
      .circle(cx - r * 0.3, cy + r * 0.15, r * 0.5)
      .fill({ color: CANOPY_COLOR, alpha });
    graphics
      .circle(cx + r * 0.3, cy + r * 0.15, r * 0.5)
      .fill({ color: CANOPY_COLOR, alpha });
  }

  protected getFillColor(): number {
    return CANOPY_COLOR;
  }
}
