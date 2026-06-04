import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const TOWER_FILL = 0x1a237e;
const TOWER_STROKE = 0x0d1452;
const BOLT_COLOR = 0xffe033;

export class EnergyTowerRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const { minX, minY, width, height } = entity.hitboxBounds;

    graphics.clear();

    // Base tower body
    graphics
      .roundRect(minX, minY, width, height, 6)
      .fill({ color: fillColor, alpha })
      .stroke({ width: 3, color: TOWER_STROKE, alpha: lineAlpha });

    // Roof band
    const roofH = Math.max(14, height * 0.1);
    graphics
      .roundRect(minX, minY, width, roofH, 4)
      .fill({ color: darkenHex(fillColor, 0.65), alpha });

    // Antenna
    const cx = minX + width / 2;
    graphics
      .rect(cx - 3, minY - 18, 6, 20)
      .fill({ color: TOWER_STROKE, alpha });
    graphics.circle(cx, minY - 20, 4).fill({ color: BOLT_COLOR, alpha });

    // Lightning bolt symbol (centered in tower body)
    const bx = cx;
    const by = minY + height / 2;
    const bw = width * 0.38;
    const bh = height * 0.45;
    drawLightningBolt(graphics, bx, by, bw, bh, BOLT_COLOR, alpha * 0.95);
  }

  protected getFillColor(_entity: ClientEntity): number {
    return TOWER_FILL;
  }
}

function darkenHex(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function drawLightningBolt(
  g: PIXI.Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: number,
  alpha: number,
): void {
  // Classic lightning bolt: top-right to center-left to bottom-right
  const hw = w / 2;
  const hh = h / 2;

  g.poly([
    cx + hw * 0.3,
    cy - hh,
    cx - hw * 0.1,
    cy - hh * 0.05,
    cx + hw * 0.5,
    cy - hh * 0.05,
    cx - hw * 0.3,
    cy + hh,
    cx + hw * 0.1,
    cy + hh * 0.05,
    cx - hw * 0.5,
    cy + hh * 0.05,
  ]).fill({ color, alpha });
}
