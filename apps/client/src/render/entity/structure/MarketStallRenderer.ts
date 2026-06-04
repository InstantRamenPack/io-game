// Scaffolded by scripts/generate-content-manifest.ts. Safe to edit; the generator will not overwrite this file.
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type * as PIXI from "pixi.js";

const FILL_COLOR = 0x607d8b;
const STROKE_COLOR = 0x263238;

function darkenColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lightenColor(hex: number, amount: number): number {
  const r = Math.min(255, ((hex >> 16) & 0xff) + amount);
  const g = Math.min(255, ((hex >> 8) & 0xff) + amount);
  const b = Math.min(255, (hex & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

export class MarketStallRenderer extends BaseEntityRenderer {
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
    const { minX, minY, width, height } = entity.hitboxBounds;
    const floorColor = lightenColor(fillColor, 45);

    graphics
      .roundRect(minX, minY, width, height, 6)
      .fill({ color: floorColor, alpha: alpha * 0.45 });

    for (const rect of entity.hitboxes) {
      graphics
        .roundRect(
          rect.offsetX - rect.width / 2,
          rect.offsetY - rect.height / 2,
          rect.width,
          rect.height,
          3,
        )
        .fill({ color: darkenColor(fillColor, 0.62), alpha })
        .stroke({ width: 2, color: STROKE_COLOR, alpha: lineAlpha });
    }
  }
}
