import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { BaseEntityRenderer } from "@client/render/entity/BaseEntityRenderer.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";
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

export class MapBuildingRenderer extends BaseEntityRenderer {
  private playerInsideBuilding = false;

  public override sync(
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void {
    super.sync(entity, presentation);

    const playerX = this.pixiRenderer.playerX;
    const playerY = this.pixiRenderer.playerY;
    if (playerX === undefined || playerY === undefined) return;

    const bounds = entity.hitboxBounds;
    // Inset so the player needs to actually cross the wall threshold
    const inset = 18;
    const nowInside =
      playerX >= entity.x + bounds.minX + inset &&
      playerX <= entity.x + bounds.maxX - inset &&
      playerY >= entity.y + bounds.minY + inset &&
      playerY <= entity.y + bounds.maxY - inset;

    if (nowInside !== this.playerInsideBuilding) {
      this.playerInsideBuilding = nowInside;
      this.redrawPresentation(entity);
    }
  }

  protected drawEntityShape(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha = 1,
  ): void {
    graphics.clear();
    if (this.playerInsideBuilding) {
      this.drawInterior(graphics, entity, fillColor, alpha, lineAlpha);
    } else {
      this.drawExterior(graphics, entity, fillColor, alpha, lineAlpha);
    }
  }

  private drawExterior(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const { minX, minY, width, height, centerX, maxY } = entity.hitboxBounds;
    const strokeColor = entity.label
      ? (STROKE_COLORS[entity.label] ?? DEFAULT_STROKE)
      : DEFAULT_STROKE;

    // Outer wall base: darker shade simulates the building walls from above
    const wallColor = darkenColor(fillColor, 0.62);
    graphics
      .roundRect(minX, minY, width, height, 6)
      .fill({ color: wallColor, alpha })
      .stroke({ width: 3, color: strokeColor, alpha: lineAlpha });

    // Roof surface: inset rectangle, main fill color — gives 3D depth
    const roofInset = Math.min(14, Math.min(width, height) * 0.07);
    graphics
      .roundRect(
        minX + roofInset,
        minY + roofInset,
        width - roofInset * 2,
        height - roofInset * 2,
        4,
      )
      .fill({ color: fillColor, alpha });

    // Door notch at bottom center showing the entry point
    const doorW = Math.max(60, Math.min(80, width * 0.15));
    graphics
      .rect(centerX - doorW / 2, maxY - roofInset, doorW, roofInset)
      .fill({ color: strokeColor, alpha: alpha * 0.75 });
  }

  private drawInterior(
    graphics: PIXI.Graphics,
    entity: ClientEntity,
    fillColor: number,
    alpha: number,
    lineAlpha: number,
  ): void {
    const { minX, minY, width, height, centerX, maxY } = entity.hitboxBounds;
    const strokeColor = entity.label
      ? (STROKE_COLORS[entity.label] ?? DEFAULT_STROKE)
      : DEFAULT_STROKE;

    const wallThick = Math.min(22, Math.min(width, height) * 0.07);
    const floorColor = lightenColor(fillColor, 55);
    const doorW = Math.max(60, Math.min(80, width * 0.15));

    // Floor base
    graphics
      .roundRect(minX, minY, width, height, 6)
      .fill({ color: floorColor, alpha: alpha * 0.9 });

    // Subtle tile grid
    const tileSize = 36;
    const innerMinX = minX + wallThick;
    const innerMinY = minY + wallThick;
    const innerW = width - wallThick * 2;
    const innerH = height - wallThick * 2;
    for (let dx = tileSize; dx < innerW; dx += tileSize) {
      graphics
        .moveTo(innerMinX + dx, innerMinY)
        .lineTo(innerMinX + dx, innerMinY + innerH)
        .stroke({ width: 1, color: strokeColor, alpha: 0.07 * lineAlpha });
    }
    for (let dy = tileSize; dy < innerH; dy += tileSize) {
      graphics
        .moveTo(innerMinX, innerMinY + dy)
        .lineTo(innerMinX + innerW, innerMinY + dy)
        .stroke({ width: 1, color: strokeColor, alpha: 0.07 * lineAlpha });
    }

    // Walls as thick filled borders
    const wallAlpha = alpha * 0.78;
    // Top
    graphics
      .rect(minX, minY, width, wallThick)
      .fill({ color: strokeColor, alpha: wallAlpha });
    // Bottom left (with door gap)
    graphics
      .rect(minX, maxY - wallThick, (width - doorW) / 2, wallThick)
      .fill({ color: strokeColor, alpha: wallAlpha });
    // Bottom right (with door gap)
    graphics
      .rect(centerX + doorW / 2, maxY - wallThick, (width - doorW) / 2, wallThick)
      .fill({ color: strokeColor, alpha: wallAlpha });
    // Left
    graphics
      .rect(minX, minY, wallThick, height)
      .fill({ color: strokeColor, alpha: wallAlpha });
    // Right
    graphics
      .rect(minX + width - wallThick, minY, wallThick, height)
      .fill({ color: strokeColor, alpha: wallAlpha });

    // Subtle door threshold shadow
    graphics
      .rect(centerX - doorW / 2, maxY - wallThick * 0.4, doorW, wallThick * 0.4)
      .fill({ color: darkenColor(floorColor, 0.82), alpha: alpha * 0.45 });
  }

  protected getFillColor(entity: ClientEntity): number {
    if (entity.label) {
      const color = LABEL_COLORS[entity.label];
      if (color !== undefined) {
        return color;
      }
    }
    return DEFAULT_FILL;
  }
}
