import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FILL_COLOR = 0x3b3b42;
const FLAME_OUTER = 0xe2531a;
const FLAME_MID = 0xff9a2e;
const FLAME_CORE = 0xffe26a;

export class BrazierRenderer extends BaseEntityRenderer {
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

    const cx = rect.offsetX;
    const cy = rect.offsetY;
    const radius = Math.min(rect.width, rect.height) / 2;
    graphics
      .circle(cx, cy, radius * 0.92)
      .fill({ color: 0xff8a3a, alpha: alpha * 0.16 });
    graphics
      .circle(cx, cy + radius * 0.2, radius * 0.7)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 2, color: 0x202024, alpha: lineAlpha });
    graphics
      .ellipse(cx, cy + radius * 0.16, radius * 0.62, radius * 0.32)
      .fill({ color: 0x232327, alpha });
    graphics
      .poly([
        cx - radius * 0.42,
        cy + radius * 0.12,
        cx,
        cy - radius * 0.95,
        cx + radius * 0.42,
        cy + radius * 0.12,
      ])
      .fill({ color: FLAME_OUTER, alpha });
    graphics
      .poly([
        cx - radius * 0.26,
        cy + radius * 0.04,
        cx,
        cy - radius * 0.62,
        cx + radius * 0.26,
        cy + radius * 0.04,
      ])
      .fill({ color: FLAME_MID, alpha });
    graphics
      .poly([
        cx - radius * 0.12,
        cy,
        cx,
        cy - radius * 0.34,
        cx + radius * 0.12,
        cy,
      ])
      .fill({ color: FLAME_CORE, alpha });
  }
}
