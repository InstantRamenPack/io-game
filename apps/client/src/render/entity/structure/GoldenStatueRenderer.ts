import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const GOLD = 0xf6c64b;
const GOLD_DARK = 0xc99421;
const GOLD_LIGHT = 0xfff2a8;

export class GoldenStatueRenderer extends BaseEntityRenderer {
  protected getFillColor(_entity: ClientEntity): number {
    return GOLD;
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

    const cx = rect.offsetX;
    const x = rect.offsetX - rect.width / 2;
    const y = rect.offsetY - rect.height / 2;
    const w = rect.width;
    const h = rect.height;
    graphics
      .roundRect(x + w * 0.12, y + h * 0.82, w * 0.76, h * 0.16, 3)
      .fill({ color: GOLD_DARK, alpha })
      .stroke({ width: 2, color: 0x7c5a16, alpha: lineAlpha });
    graphics
      .circle(cx, y + h * 0.16, w * 0.18)
      .fill({ color: GOLD, alpha })
      .stroke({ width: 1.5, color: GOLD_DARK, alpha: lineAlpha });
    graphics
      .moveTo(cx, y + h * 0.3)
      .lineTo(cx - w * 0.26, y + h * 0.82)
      .lineTo(cx + w * 0.26, y + h * 0.82)
      .closePath()
      .fill({ color: GOLD, alpha })
      .stroke({ width: 1.5, color: GOLD_DARK, alpha: lineAlpha });
    for (const sign of [-1, 1]) {
      graphics
        .moveTo(cx + sign * w * 0.1, y + h * 0.36)
        .lineTo(cx + sign * w * 0.34, y + h * 0.58)
        .stroke({ width: Math.max(3, w * 0.08), color: GOLD, alpha });
    }
    graphics
      .rect(cx - w * 0.04, y + h * 0.08, w * 0.08, h * 0.74)
      .fill({ color: GOLD_LIGHT, alpha: alpha * 0.3 });
  }
}
