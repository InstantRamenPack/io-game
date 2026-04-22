import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import { drawRoundedRect } from "@client/render/pixi/PixiGraphicUtils.ts";
import type * as PIXI from "pixi.js";

const LABEL_COLORS: Record<string, number> = {
  "Command Center": 0x37474f,
  "Military HQ": 0x37474f,
  Armory: 0x455a64,
  Barracks: 0x5d6b4a,
  "Vehicle Bay": 0x546e5a,
  "Guard Tower": 0x616161,
  Watchtower: 0x616161,
  House: 0xb08050,
  Farm: 0x7a9a52,
  Blacksmith: 0x7a5230,
  Clinic: 0xdde8ea,
  "Control Booth": 0x546e7a,
  "Supply Cache": 0x7a6248,
  Hangar: 0x4a5568,
};

const STROKE_COLORS: Record<string, number> = {
  "Command Center": 0x1a2a30,
  "Military HQ": 0x1a2a30,
  Armory: 0x1a2a30,
  Barracks: 0x2a3020,
  "Vehicle Bay": 0x1a3020,
  "Guard Tower": 0x303030,
  Watchtower: 0x303030,
  House: 0x5a3a18,
  Farm: 0x3a5018,
  Blacksmith: 0x3a2010,
  Clinic: 0x60a0b0,
  "Control Booth": 0x203038,
  "Supply Cache": 0x3a2a18,
  Hangar: 0x1a2030,
};

const DEFAULT_FILL = 0x607d8b;
const DEFAULT_STROKE = 0x263238;

export class MapBuildingRenderer extends BaseEntityRenderer {
  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    const strokeColor = entity.label
      ? (STROKE_COLORS[entity.label] ?? DEFAULT_STROKE)
      : DEFAULT_STROKE;

    drawRoundedRect(
      graphics,
      entity.hitboxBounds.minX,
      entity.hitboxBounds.minY,
      entity.hitboxBounds.width,
      entity.hitboxBounds.height,
      6,
      { color: fillColor, alpha },
      { width: 3, color: strokeColor, alpha: lineAlpha },
    );

    // Door notch on bottom edge
    const bx = entity.hitboxBounds.centerX;
    const by = entity.hitboxBounds.maxY;
    const doorW = Math.min(30, entity.hitboxBounds.width * 0.15);
    const doorH = 10;
    graphics
      .rect(bx - doorW / 2, by - doorH, doorW, doorH)
      .fill({ color: strokeColor, alpha: alpha * 0.6 });
  }

  protected getFillColor(entity: ClientEntity): number {
    if (entity.label && LABEL_COLORS[entity.label]) {
      return LABEL_COLORS[entity.label];
    }
    return DEFAULT_FILL;
  }
}
