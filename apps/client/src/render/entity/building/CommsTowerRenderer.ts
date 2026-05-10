import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const TOWER_FILL = 0x1b5e20;
const TOWER_STROKE = 0x0a3010;
const WIFI_COLOR = 0x69ff74;

export class CommsTowerRenderer extends BaseEntityRenderer {
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

    // Antenna mast
    const cx = minX + width / 2;
    graphics
      .rect(cx - 3, minY - 22, 6, 24)
      .fill({ color: TOWER_STROKE, alpha });

    // Dish on top of antenna
    const dishW = width * 0.35;
    const dishH = dishW * 0.45;
    graphics
      .ellipse(cx, minY - 22, dishW / 2, dishH / 2)
      .fill({ color: darkenHex(fillColor, 0.5), alpha })
      .stroke({ width: 2, color: WIFI_COLOR, alpha: alpha * 0.8 });

    // Wifi arcs (3 arcs centered in tower body)
    const wx = cx;
    const wy = minY + height * 0.58;
    const maxR = Math.min(width * 0.35, height * 0.22);
    drawWifiArcs(graphics, wx, wy, maxR, WIFI_COLOR, alpha * 0.9);
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

function drawWifiArcs(
  g: PIXI.Graphics,
  cx: number,
  cy: number,
  maxR: number,
  color: number,
  alpha: number,
): void {
  const arcCount = 3;
  const startAngle = Math.PI + Math.PI * 0.15;
  const endAngle = Math.PI * 2 - Math.PI * 0.15;

  for (let i = 0; i < arcCount; i++) {
    const r = maxR * ((i + 1) / arcCount);
    g.arc(cx, cy, r, startAngle, endAngle).stroke({
      width: 2.5,
      color,
      alpha: alpha * (0.5 + 0.5 * ((i + 1) / arcCount)),
    });
  }

  // Center dot
  g.circle(cx, cy, 3).fill({ color, alpha });
}
