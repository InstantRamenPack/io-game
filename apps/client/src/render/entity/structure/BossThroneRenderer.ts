import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const GOLD = 0xffcf3f;
const GOLD_DARK = 0xc99421;
const CUSHION = 0x8e1f24;
const BONE = 0xe7e2cf;
const BONE_DARK = 0xbab48f;

export class BossThroneRenderer extends BaseEntityRenderer {
  protected getFillColor(_entity: ClientEntity): number {
    return 0x4a4a55;
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
    const cx = rect.offsetX;
    const w = rect.width;
    const h = rect.height;
    graphics
      .roundRect(x + w * 0.16, y + h * 0.08, w * 0.68, h * 0.78, 6)
      .fill({ color: 0x3a3a44, alpha })
      .stroke({ width: 2, color: 0x202026, alpha: lineAlpha });
    for (const sign of [-1, 1]) {
      graphics
        .roundRect(
          cx + sign * w * 0.4 - w * 0.08,
          y + h * 0.18,
          w * 0.16,
          h * 0.74,
          5,
        )
        .fill({ color: 0x4a4a55, alpha })
        .stroke({ width: 2, color: 0x202026, alpha: lineAlpha });
      graphics
        .poly([
          cx + sign * w * 0.4 - w * 0.05,
          y + h * 0.18,
          cx + sign * w * 0.4,
          y + h * 0.02,
          cx + sign * w * 0.4 + w * 0.05,
          y + h * 0.18,
        ])
        .fill({ color: GOLD_DARK, alpha });
    }
    graphics
      .roundRect(x + w * 0.24, y + h * 0.3, w * 0.52, h * 0.4, 5)
      .fill({ color: CUSHION, alpha })
      .stroke({ width: 1.5, color: 0x5a1014, alpha: lineAlpha });
    graphics
      .roundRect(x + w * 0.2, y + h * 0.66, w * 0.6, h * 0.2, 4)
      .fill({ color: CUSHION, alpha });
    graphics
      .rect(x + w * 0.24, y + h * 0.12, w * 0.52, 4)
      .fill({ color: GOLD, alpha });
    const skullR = w * 0.07;
    graphics
      .circle(cx, y + h * 0.2, skullR)
      .fill({ color: BONE, alpha })
      .stroke({ width: 1, color: BONE_DARK, alpha: lineAlpha });
    graphics
      .circle(cx - skullR * 0.4, y + h * 0.2, skullR * 0.25)
      .fill({ color: 0x26201c, alpha });
    graphics
      .circle(cx + skullR * 0.4, y + h * 0.2, skullR * 0.25)
      .fill({ color: 0x26201c, alpha });
  }
}
