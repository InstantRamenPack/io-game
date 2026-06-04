import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const GOLD = 0xffcf3f;
const GOLD_DARK = 0xc99421;
const GOLD_LIGHT = 0xfff2a8;

export class GoldPileRenderer extends BaseEntityRenderer {
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
    const baseY = rect.offsetY + rect.height / 2;
    const w = rect.width;
    const h = rect.height;
    graphics
      .ellipse(cx, baseY - h * 0.12, w * 0.48, h * 0.2)
      .fill({ color: GOLD_DARK, alpha: alpha * 0.55 });
    graphics
      .moveTo(cx - w * 0.5, baseY)
      .quadraticCurveTo(cx - w * 0.2, baseY - h * 1.0, cx, baseY - h * 0.62)
      .quadraticCurveTo(cx + w * 0.24, baseY - h * 1.05, cx + w * 0.5, baseY)
      .closePath()
      .fill({ color: GOLD, alpha })
      .stroke({ width: 1.5, color: GOLD_DARK, alpha: lineAlpha });
    for (const coin of [
      { dx: -w * 0.28, dy: -h * 0.12 },
      { dx: -w * 0.02, dy: -h * 0.32 },
      { dx: w * 0.26, dy: -h * 0.1 },
      { dx: w * 0.12, dy: -h * 0.02 },
    ]) {
      graphics
        .ellipse(cx + coin.dx, baseY + coin.dy, w * 0.12, h * 0.09)
        .fill({ color: GOLD_LIGHT, alpha })
        .stroke({ width: 1, color: GOLD_DARK, alpha: lineAlpha });
    }
    graphics
      .circle(cx - w * 0.04, baseY - h * 0.42, Math.max(2, w * 0.05))
      .fill({ color: 0x44d6ff, alpha });
    graphics
      .circle(cx + w * 0.2, baseY - h * 0.24, Math.max(2, w * 0.045))
      .fill({ color: 0xff5d7a, alpha });
  }
}
